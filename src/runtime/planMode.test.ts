import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ScriptedProvider } from "../providers/scriptedProvider.js";
import {
  createDefaultSystemPrompt,
  createHarnessSession,
  HarnessRuntime
} from "./harness.js";
import { createDefaultTools } from "../tools/defaultTools.js";
import type {
  HarnessConfig,
  Provider,
  ProviderTurnRequest,
  ProviderTurnResponse
} from "../types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(dir, { recursive: true, force: true })
    );
  }
});

describe("Plan Mode", () => {
  it("offers only read allowlist plus update_plan to the Provider", async () => {
    const dir = await makeFixtureDir();
    const recorder = new RecordingProvider(
      new ScriptedProvider([
        {
          when: () => true,
          response: () => ({
            stopReason: "completed",
            assistantMessage: {
              role: "assistant",
              content: "explored; plan still empty"
            },
            toolCalls: []
          })
        }
      ])
    );
    const session = createHarnessSession(createRuntime(dir, recorder));
    session.enterPlanMode();

    await session.runTurn("explore how harness works");

    const toolNames = (recorder.requests[0]?.tools ?? [])
      .map((tool) => tool.name)
      .sort();
    expect(toolNames).toEqual(
      ["read_file", "search_workspace", "update_plan"].sort()
    );
    expect(session.snapshot().planMode).toBe(true);
  });

  it("writes Plan document via update_plan without touching the workspace", async () => {
    const dir = await makeFixtureDir();
    const planMarkdown = [
      "# Add Plan Mode",
      "## Goal",
      "Ship read-only planning",
      "## Acceptance",
      "Tests pass"
    ].join("\n");
    const recorder = new RecordingProvider(
      new ScriptedProvider([
        {
          when: (request) => request.messages.at(-1)?.role === "user",
          response: () => ({
            toolCalls: [
              {
                callId: "plan-1",
                toolName: "update_plan",
                arguments: { markdown: planMarkdown }
              }
            ],
            stopReason: "tool_calls"
          })
        },
        {
          when: (request) => request.messages.at(-1)?.role === "tool",
          response: () => ({
            stopReason: "completed",
            assistantMessage: {
              role: "assistant",
              content: "Plan document saved"
            },
            toolCalls: []
          })
        }
      ])
    );
    const session = createHarnessSession(createRuntime(dir, recorder));
    session.enterPlanMode();

    await session.runTurn("draft a plan");

    expect(session.snapshot().plan).toBe(planMarkdown);
    expect(recorder.requests.some((request) => request.systemPrompt.includes(planMarkdown))).toBe(
      true
    );
  });

  it("fail-closes mutating tool calls while in Plan Mode", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "note.txt"), "before", "utf8");
    const session = createHarnessSession(
      createRuntime(
        dir,
        new ScriptedProvider([
          {
            when: (request) => request.messages.at(-1)?.role === "user",
            response: () => ({
              toolCalls: [
                {
                  callId: "patch-1",
                  toolName: "apply_patch",
                  arguments: {
                    path: "note.txt",
                    find: "before",
                    replace: "after"
                  }
                }
              ],
              stopReason: "tool_calls"
            })
          },
          {
            when: (request) => request.messages.at(-1)?.role === "tool",
            response: (request) => {
              const message = request.messages.at(-1);
              return {
                assistantMessage: {
                  role: "assistant",
                  content:
                    message && message.role === "tool"
                      ? message.content
                      : "missing"
                },
                toolCalls: [],
                stopReason: "completed"
              };
            }
          }
        ])
      )
    );
    session.enterPlanMode();

    const result = await session.runTurn("try to patch");

    expect(result.output).toContain("Tool not available in Plan Mode");
    expect(await readFile(join(dir, "note.txt"), "utf8")).toBe("before");
  });

  it("rejects /execute when Plan is empty and promotes Plan to Task when present", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));
    session.enterPlanMode();
    await session.runTurn("hello");

    expect(session.executePlan()).toEqual({
      ok: false,
      reason: "Plan document is empty — call update_plan before /execute"
    });

    const planMarkdown = "## Goal\nBuild Plan Mode\n## Acceptance\nDone";
    session.enterPlanMode();
    // Seed via update_plan path through a turn
    const seeded = createHarnessSession(
      createRuntime(
        dir,
        new ScriptedProvider([
          {
            when: (request) => request.messages.at(-1)?.role === "user",
            response: () => ({
              toolCalls: [
                {
                  callId: "plan-1",
                  toolName: "update_plan",
                  arguments: { markdown: planMarkdown }
                }
              ],
              stopReason: "tool_calls"
            })
          },
          {
            when: (request) => request.messages.at(-1)?.role === "tool",
            response: () => ({
              stopReason: "completed",
              assistantMessage: { role: "assistant", content: "saved" },
              toolCalls: []
            })
          }
        ])
      )
    );
    seeded.enterPlanMode();
    await seeded.runTurn("write plan");
    const transcriptBefore = seeded.snapshot().transcript.length;
    expect(seeded.executePlan()).toEqual({ ok: true });
    const snap = seeded.snapshot();
    expect(snap.planMode).toBe(false);
    expect(snap.plan).toBe(planMarkdown);
    expect(snap.context.task).toContain("Build Plan Mode");
    expect(snap.stepChecklist?.steps.some((step) => step.id === "use-tools")).toBe(
      true
    );
    expect(snap.transcript.length).toBe(transcriptBefore);
  });

  it("keeps Plan draft on exitPlanMode and discards it on clear", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(
      createRuntime(
        dir,
        new ScriptedProvider([
          {
            when: (request) => request.messages.at(-1)?.role === "user",
            response: () => ({
              toolCalls: [
                {
                  callId: "plan-1",
                  toolName: "update_plan",
                  arguments: { markdown: "## Goal\nDraft" }
                }
              ],
              stopReason: "tool_calls"
            })
          },
          {
            when: (request) => request.messages.at(-1)?.role === "tool",
            response: () => ({
              stopReason: "completed",
              assistantMessage: { role: "assistant", content: "ok" },
              toolCalls: []
            })
          }
        ])
      )
    );
    session.enterPlanMode();
    await session.runTurn("draft");
    session.exitPlanMode();
    expect(session.snapshot().planMode).toBe(false);
    expect(session.snapshot().plan).toContain("Draft");

    session.clear();
    expect(session.snapshot().plan).toBeNull();
    expect(session.snapshot().planMode).toBe(false);
  });

  it("injects planning Step checklist and Plan Mode guidance", async () => {
    const dir = await makeFixtureDir();
    const recorder = new RecordingProvider(
      new ScriptedProvider([
        {
          when: () => true,
          response: () => ({
            stopReason: "completed",
            assistantMessage: { role: "assistant", content: "planning" },
            toolCalls: []
          })
        }
      ])
    );
    const session = createHarnessSession(createRuntime(dir, recorder));
    session.enterPlanMode();
    await session.runTurn("plan the feature");

    const system = recorder.requests[0]?.systemPrompt ?? "";
    expect(system).toContain("Plan Mode:");
    expect(system).toContain("write-plan");
    expect(system).toContain("(empty — call update_plan");
  });

  it("does not inject archived Plan into Assembled prompt outside Plan Mode", async () => {
    const dir = await makeFixtureDir();
    const recorder = new RecordingProvider(
      new ScriptedProvider([
        {
          when: (request) =>
            request.tools.some((tool) => tool.name === "update_plan") &&
            request.messages.at(-1)?.role === "user",
          response: () => ({
            toolCalls: [
              {
                callId: "plan-1",
                toolName: "update_plan",
                arguments: { markdown: "## Goal\nSecret draft plan body" }
              }
            ],
            stopReason: "tool_calls"
          })
        },
        {
          when: (request) =>
            request.tools.some((tool) => tool.name === "update_plan") &&
            request.messages.at(-1)?.role === "tool",
          response: () => ({
            stopReason: "completed",
            assistantMessage: { role: "assistant", content: "saved draft" },
            toolCalls: []
          })
        },
        {
          when: () => true,
          response: () => ({
            stopReason: "completed",
            assistantMessage: { role: "assistant", content: "normal turn" },
            toolCalls: []
          })
        }
      ])
    );
    const session = createHarnessSession(createRuntime(dir, recorder));
    session.enterPlanMode();
    await session.runTurn("draft");
    session.exitPlanMode();
    await session.runTurn("also continue without plan mode");

    const last = recorder.requests.at(-1)?.systemPrompt ?? "";
    expect(last).not.toContain("Secret draft plan body");
    expect(last).not.toContain("Plan Mode:");
    expect(session.snapshot().plan).toContain("Secret draft plan body");
  });
});

class RecordingProvider implements Provider {
  readonly name: string;
  readonly requests: ProviderTurnRequest[] = [];

  constructor(private readonly inner: Provider) {
    this.name = `recording:${inner.name}`;
  }

  async sendTurn(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    this.requests.push({
      systemPrompt: request.systemPrompt,
      messages: request.messages.map((message) => ({ ...message })),
      tools: request.tools
    });
    return this.inner.sendTurn(request);
  }
}

function createRuntime(dir: string, provider: Provider = new ScriptedProvider()) {
  return new HarnessRuntime(provider, createDefaultTools(), {
    cwd: dir,
    maxTurns: 4,
    allowGuardedTools: false,
    systemPrompt: createDefaultSystemPrompt(),
    tokenBudget: 8_000,
    skillsHomeDir: join(dir, ".honey-test-home"),
    sessionEventLog: false
  } satisfies HarnessConfig);
}

async function makeFixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), "honey-plan-mode-"));
  tempDirs.push(dir);
  return dir;
}
