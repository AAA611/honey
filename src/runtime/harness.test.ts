import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    await BunRemoval.remove(dir);
  }
});

describe("HarnessRuntime", () => {
  it("runs a safe tool flow and returns a final assistant response", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "note.txt"), "hello harness", "utf8");
    const runtime = createRuntime(dir);

    const result = await runtime.run("read: note.txt");

    expect(result.finalState).toBe("DONE");
    expect(result.output).toContain("hello harness");
    expect(result.events.some((event) => event.type === "tool_call")).toBe(true);
  });

  it("preserves shared session context across multiple turns", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("search: harness");
    const secondRun = await session.runTurn("read: note.txt");

    expect(secondRun.events.length).toBeGreaterThan(0);
    expect(session.snapshot().transcript.length).toBeGreaterThan(2);
  });

  it("sends Assembled prompt to Provider instead of full Transcript", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "note.txt"), "hello harness", "utf8");
    const recorder = new RecordingProvider(new ScriptedProvider());
    const session = createHarnessSession(createRuntime(dir, false, recorder));

    await session.runTurn("read: note.txt");

    const snapshot = session.snapshot();
    expect(snapshot.transcript.length).toBeGreaterThan(
      recorder.requests.at(-1)?.messages.length ?? 0
    );
    for (const request of recorder.requests) {
      expect(request.systemPrompt).toContain("Task:");
      expect(request.systemPrompt).toContain("Plan:");
    }
    const firstUser = recorder.requests[0]?.messages.find(
      (message) => message.role === "user"
    );
    expect(firstUser?.role).toBe("user");
    if (firstUser?.role === "user") {
      expect(snapshot.transcript.some(
        (message) =>
          message.role === "user" && message.content === firstUser.content
      )).toBe(true);
    }
    const lastRequest = recorder.requests.at(-1);
    expect(lastRequest?.messages.some((message) => message.role === "tool")).toBe(
      true
    );
  });

  it("injects Skill catalog and explicit $skill body into Assembled prompt", async () => {
    const dir = await makeFixtureDir();
    await mkdir(join(dir, ".honey", "skills", "demo"), { recursive: true });
    await writeFile(
      join(dir, ".honey", "skills", "demo", "SKILL.md"),
      `---
name: demo
description: Demo skill for harness wiring
---

FOLLOW_DEMO_SKILL
`,
      "utf8"
    );
    const recorder = new RecordingProvider(
      new ScriptedProvider([
        {
          when: () => true,
          response: () => ({
            stopReason: "completed",
            assistantMessage: {
              role: "assistant",
              content: "done with demo skill"
            },
            toolCalls: []
          })
        }
      ])
    );
    const session = createHarnessSession(createRuntime(dir, false, recorder));

    await session.runTurn("$demo summarize the skill");

    expect(recorder.requests[0]?.systemPrompt).toContain("Skill catalog:");
    expect(recorder.requests[0]?.systemPrompt).toContain("demo:");
    expect(recorder.requests[0]?.systemPrompt).toContain("FOLLOW_DEMO_SKILL");
    expect(recorder.requests[0]?.systemPrompt).toContain("Skill instructions:");
    const user = recorder.requests[0]?.messages.find((message) => message.role === "user");
    expect(user && user.role === "user" ? user.content : "").toBe(
      "summarize the skill"
    );
  });

  it("keeps Task framing distinct from Plan steps in Session snapshot", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("read: note.txt");

    const snapshot = session.snapshot();
    expect(snapshot.context.task).toContain("read: note.txt");
    expect(snapshot.plan?.goal).toBe("read: note.txt");
    expect(snapshot.plan?.steps.length).toBeGreaterThan(0);
    expect(snapshot.context.task).not.toEqual(
      snapshot.plan?.steps.map((step) => step.title).join("\n")
    );
  });

  it("loads read-only Project instructions into Root set", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "AGENTS.md"), "Prefer patch-first edits.", "utf8");
    const recorder = new RecordingProvider(new ScriptedProvider());
    const session = createHarnessSession(createRuntime(dir, false, recorder));

    await session.runTurn("hello");

    expect(session.snapshot().context.projectInstructions).toContain(
      "Prefer patch-first edits."
    );
    expect(recorder.requests[0]?.systemPrompt).toContain("Prefer patch-first edits.");
  });

  it("compacts oversized tool results before summarizing under a tight token budget", async () => {
    const dir = await makeFixtureDir();
    const huge = "X".repeat(4000);
    await writeFile(join(dir, "big.txt"), huge, "utf8");
    const recorder = new RecordingProvider(new ScriptedProvider());
    const session = createHarnessSession(
      createRuntime(dir, false, recorder, { tokenBudget: 900 })
    );

    await session.runTurn("read: big.txt");
    const snapshot = session.snapshot();
    const providerTool = recorder.requests
      .flatMap((request) => request.messages)
      .find((message) => message.role === "tool");

    expect(providerTool?.role).toBe("tool");
    if (providerTool?.role === "tool") {
      expect(providerTool.content.length).toBeLessThan(huge.length);
    }
    expect(snapshot.transcript.some((message) => message.role === "tool")).toBe(
      true
    );
    const transcriptTool = snapshot.transcript.find(
      (message) => message.role === "tool"
    );
    if (transcriptTool?.role === "tool") {
      expect(transcriptTool.content).toContain("XXX");
      expect(transcriptTool.content.length).toBeGreaterThan(
        providerTool && providerTool.role === "tool"
          ? providerTool.content.length
          : 0
      );
    }
    expect(snapshot.context.task).toContain("read: big.txt");
    expect(snapshot.plan).not.toBeNull();
  });

  it("summarizes older Working set while preserving Root set under sustained pressure", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "note.txt"), "hello ".repeat(200), "utf8");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), { tokenBudget: 500 })
    );

    await session.runTurn("read: note.txt");
    await session.runTurn("also search: harness");
    await session.runTurn("also read: note.txt");

    const snapshot = session.snapshot();
    expect(snapshot.context.summary.length).toBeGreaterThan(0);
    expect(snapshot.context.task.length).toBeGreaterThan(0);
    expect(snapshot.plan).not.toBeNull();
    expect(snapshot.context.environment).toContain(dir);
  });

  it("auto-pins path mentions as Pinned artifacts in the Root set", async () => {
    const dir = await makeFixtureDir();
    await writeFile(join(dir, "target.ts"), "export const n = 1;\n", "utf8");
    const recorder = new RecordingProvider(new ScriptedProvider());
    const session = createHarnessSession(createRuntime(dir, false, recorder));

    await session.runTurn("Please inspect @target.ts later");

    const pinned = session.snapshot().context.pinned;
    expect(pinned.some((item) => item.label.includes("target.ts"))).toBe(true);
    expect(recorder.requests[0]?.systemPrompt).toContain("target.ts");
  });

  it("soft-continues Task by default and hard-switches on new-task signal", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("read: note.txt");
    expect(session.snapshot().context.task).toContain("read: note.txt");

    await session.runTurn("also summarize what you found");
    expect(session.snapshot().context.task).toContain("read: note.txt");

    await session.runTurn("/new build a token budget");
    expect(session.snapshot().context.task).toContain("build a token budget");
    expect(session.snapshot().plan?.goal).toContain("build a token budget");
  });

  it("hard-switches Task when Plan is complete and the next goal looks new", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("hello there");
    const completed = session.snapshot().plan;
    expect(completed?.steps.every((step) => step.status === "done")).toBe(true);

    await session.runTurn(
      "Now implement an unrelated feature called context inventory"
    );
    expect(session.snapshot().context.task).toContain("context inventory");
  });

  it("exposes Context inventory and persists structural Assembled prompt snapshots", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("hello");

    const inventory = session.formatContextInventory();
    expect(inventory).toContain("Context inventory");
    expect(inventory).toContain("Working set");
    expect(inventory).toContain("Root set");
    expect(inventory).toMatch(/Task:/);

    const snapshot = session.snapshot();
    expect(snapshot.assemblySnapshots.length).toBeGreaterThan(0);
    expect(snapshot.assemblySnapshots[0]?.layers.task.length).toBeGreaterThan(0);
    expect(snapshot.assemblySnapshots[0]?.tokenEstimate).toBeGreaterThan(0);
  });

  it("resets Session context layers on clear", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    await session.runTurn("hello");
    expect(session.snapshot().transcript.length).toBeGreaterThan(0);

    session.clear();
    const snapshot = session.snapshot();
    expect(snapshot.transcript).toEqual([]);
    expect(snapshot.context.workingSet).toEqual([]);
    expect(snapshot.plan).toBeNull();
    expect(snapshot.context.task).toBe("");
  });

  it("can apply a guarded patch when approval is enabled", async () => {
    const dir = await makeFixtureDir();
    const filePath = join(dir, "editable.txt");
    await writeFile(filePath, "before", "utf8");
    const runtime = createRuntime(
      dir,
      true,
      new ScriptedProvider([
        {
          when: (request) => request.messages.at(-1)?.role === "user",
          response: () => ({
            toolCalls: [
              {
                callId: "patch-call",
                toolName: "apply_patch",
                arguments: {
                  path: "editable.txt",
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
          response: () => ({
            assistantMessage: {
              role: "assistant",
              content: "Patch applied."
            },
            toolCalls: [],
            stopReason: "completed"
          })
        }
      ])
    );

    const result = await runtime.run("change file");
    const updated = await readFile(filePath, "utf8");

    expect(result.finalState).toBe("DONE");
    expect(updated).toBe("after");
  });

  it("surfaces Provider failures as a failed Run", async () => {
    const dir = await makeFixtureDir();
    const runtime = createRuntime(dir, false, {
      name: "failing-provider",
      async sendTurn() {
        throw new Error("OpenAI-compatible provider HTTP 401: Invalid API key");
      }
    });

    const result = await runtime.run("hello");

    expect(result.finalState).toBe("ERROR");
    expect(result.output).toContain("HTTP 401");
    expect(result.events.some((event) => event.type === "error")).toBe(true);
  });

  it("records assembled layers on model_request events", async () => {
    const dir = await makeFixtureDir();
    const session = createHarnessSession(createRuntime(dir));

    const result = await session.runTurn("hello");
    const requestEvent = result.events.find((event) => event.type === "model_request");

    expect(requestEvent?.payload).toMatchObject({
      assembled: true
    });
    expect(requestEvent?.payload.task).toBeTruthy();
    expect(requestEvent?.payload.workingSetCount).toEqual(expect.any(Number));
  });

  it("writes Assembled prompt dumps when dumpPrompts is enabled", async () => {
    const dir = await makeFixtureDir();
    const dumpDir = join(dir, "prompt-dumps");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        dumpPrompts: true,
        dumpPromptsDir: dumpDir
      })
    );

    await session.runTurn("hello");

    const files = await import("node:fs/promises").then(({ readdir }) =>
      readdir(dumpDir, { recursive: true })
    );
    const dumpFiles = files
      .map(String)
      .filter((name) => name.endsWith(".md"));
    expect(dumpFiles.length).toBeGreaterThan(0);

    const body = await readFile(join(dumpDir, dumpFiles[0]!), "utf8");
    expect(body).toContain("# Assembled prompt");
    expect(body).toContain("## systemPrompt");
    expect(body).toContain("## messages");
    expect(body).toContain("Task:");
  });

  it("does not write Assembled prompt dumps when dumpPrompts is off", async () => {
    const dir = await makeFixtureDir();
    const dumpDir = join(dir, "prompt-dumps");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        dumpPrompts: false,
        dumpPromptsDir: dumpDir
      })
    );

    await session.runTurn("hello");

    const exists = await import("node:fs/promises")
      .then(({ access }) => access(dumpDir).then(() => true))
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("writes a Session event log with session_started and Run events", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: true,
        sessionEventLogDir: logDir
      })
    );

    const result = await session.runTurn("hello");
    const logPath = session.sessionEventLogPath;
    expect(logPath).toBeTruthy();
    expect(logPath).toContain(logDir);

    const events = await readJsonl(logPath!);
    expect(events[0]?.type).toBe("session_started");
    expect(events[0]?.sessionId).toBe(session.sessionId);
    expect(events.some((event) => event.type === "run_started")).toBe(true);
    expect(events.some((event) => event.type === "run_finished")).toBe(true);
    expect(result.events.some((event) => event.type === "run_started")).toBe(true);
    for (const event of events.filter((item) => item.type === "run_started")) {
      expect(event.sessionId).toBe(session.sessionId);
      expect(event.runId).toBeTruthy();
    }
  });

  it("keeps the same Session event log after clear and records session_cleared", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: true,
        sessionEventLogDir: logDir
      })
    );

    await session.runTurn("first");
    const pathBefore = session.sessionEventLogPath;
    session.clear();
    await session.runTurn("second");
    const pathAfter = session.sessionEventLogPath;

    expect(pathAfter).toBe(pathBefore);
    const events = await readJsonl(pathAfter!);
    expect(events.some((event) => event.type === "session_cleared")).toBe(true);
    const runStarts = events.filter((event) => event.type === "run_started");
    expect(runStarts).toHaveLength(2);
    expect(runStarts[0]?.runId).not.toBe(runStarts[1]?.runId);
    expect(runStarts[0]?.sessionId).toBe(runStarts[1]?.sessionId);
  });

  it("omits full systemPrompt from model_request events in memory and on disk", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: true,
        sessionEventLogDir: logDir
      })
    );

    const result = await session.runTurn("hello");
    const requestEvent = result.events.find((event) => event.type === "model_request");
    expect(requestEvent?.payload.systemPrompt).toBeUndefined();
    expect(requestEvent?.payload).toMatchObject({
      assembled: true,
      workingSetCount: expect.any(Number)
    });

    const diskEvents = await readJsonl(session.sessionEventLogPath!);
    const diskRequest = diskEvents.find((event) => event.type === "model_request");
    expect(diskRequest?.payload?.systemPrompt).toBeUndefined();
  });

  it("does not write a Session event log when sessionEventLog is disabled", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: false,
        sessionEventLogDir: logDir
      })
    );

    await session.runTurn("hello");

    expect(session.sessionEventLogPath).toBeNull();
    const exists = await import("node:fs/promises")
      .then(({ access }) => access(logDir).then(() => true))
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("writes session_ended when the Session ends", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: true,
        sessionEventLogDir: logDir
      })
    );

    await session.runTurn("hello");
    session.end();

    const events = await readJsonl(session.sessionEventLogPath!);
    expect(events.at(-1)?.type).toBe("session_ended");
  });

  it("links Assembled prompt dumps via promptDumpPath on model_request", async () => {
    const dir = await makeFixtureDir();
    const logDir = join(dir, "session-logs");
    const dumpDir = join(dir, "prompt-dumps");
    const session = createHarnessSession(
      createRuntime(dir, false, new ScriptedProvider(), {
        sessionEventLog: true,
        sessionEventLogDir: logDir,
        dumpPrompts: true,
        dumpPromptsDir: dumpDir
      })
    );

    const result = await session.runTurn("hello");
    const requestEvent = result.events.find((event) => event.type === "model_request");
    expect(typeof requestEvent?.payload.promptDumpPath).toBe("string");
    expect(String(requestEvent?.payload.promptDumpPath)).toContain(dumpDir);

    const diskEvents = await readJsonl(session.sessionEventLogPath!);
    const diskRequest = diskEvents.find((event) => event.type === "model_request");
    expect(diskRequest?.payload?.promptDumpPath).toBe(requestEvent?.payload.promptDumpPath);
  });
});

async function readJsonl(path: string) {
  const body = await readFile(path, "utf8");
  return body
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type: string;
      sessionId?: string;
      runId?: string;
      payload?: Record<string, unknown>;
    });
}

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

function createRuntime(
  dir: string,
  allowGuardedTools = false,
  provider: Provider = new ScriptedProvider(),
  overrides: Partial<HarnessConfig> = {}
) {
  return new HarnessRuntime(provider, createDefaultTools(), {
    cwd: dir,
    maxTurns: 4,
    allowGuardedTools,
    systemPrompt: createDefaultSystemPrompt(),
    tokenBudget: 8_000,
    skillsHomeDir: join(dir, ".honey-test-home"),
    sessionEventLog: false,
    ...overrides
  });
}

async function makeFixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), "honey-harness-"));
  tempDirs.push(dir);
  return dir;
}

class BunRemoval {
  static async remove(path: string) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(path, { recursive: true, force: true })
    );
  }
}
