/**
 * Approval panel should surface a clear structured review, not a noisy one-liner.
 *
 * Command:
 *   npx vitest run src/tui/approval.panel.test.tsx
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "../../tui/App.js";
import type { HarnessRuntime, HarnessSession } from "../../runtime/harness.js";
import { SkillRegistry } from "../../skills/registry.js";
import type { ApprovalRequest, ConversationMessage } from "../../types.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Approval panel in Session TUI", () => {
  it("shows structured apply_patch review and resolves on y", async () => {
    let approvalResult: boolean | null = null;
    const approvalRequest: ApprovalRequest = {
      toolName: "apply_patch",
      callId: "c1",
      arguments: {
        path: "editable.txt",
        find: "old line",
        replace: "new line"
      },
      argumentSummary: "path=editable.txt find=old line replace=new line"
    };

    const { runtime, session } = createMocks({
      runTurn: async () => {
        const host = runtime.config.requestApproval;
        if (!host) {
          throw new Error("requestApproval host was not wired");
        }
        approvalResult = await host(approvalRequest);
        return {
          output: "patched",
          events: [],
          finalState: "DONE",
          stepChecklist: { goal: "test", steps: [] },
          plan: { goal: "test", steps: [] }
        };
      },
      transcriptAfterTurn: [
        { role: "user", content: "patch it" },
        { role: "assistant", content: "patched" }
      ]
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("patch it");
    await settle(40);
    stdin.write("\r");
    await settle(100);

    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/Approval/);
    expect(frame).toMatch(/Allow apply_patch\?/);
    expect(frame).toMatch(/editable\.txt/);
    expect(frame).toMatch(/old line/);
    expect(frame).toMatch(/new line/);
    expect(frame).toMatch(/awaiting approval/i);
    expect(frame).toMatch(/y allow/);
    expect(frame).not.toMatch(/running…/);

    stdin.write("y");
    await settle(100);

    expect(approvalResult).toBe(true);
    const done = lastFrame() ?? "";
    expect(done).toContain("patched");
    expect(done).not.toMatch(/awaiting approval/i);
  });

  it("denies on Esc without treating the prompt as Composer text", async () => {
    let approvalResult: boolean | null = null;

    const { runtime, session } = createMocks({
      runTurn: async () => {
        const host = runtime.config.requestApproval;
        if (!host) {
          throw new Error("requestApproval host was not wired");
        }
        approvalResult = await host({
          toolName: "exec_command",
          callId: "c2",
          arguments: { action: "start", command: "rm -rf /" },
          argumentSummary: "action=start command=rm -rf /"
        });
        return {
          output: "denied path",
          events: [],
          finalState: "DONE",
          stepChecklist: { goal: "test", steps: [] },
          plan: { goal: "test", steps: [] }
        };
      },
      transcriptAfterTurn: [
        { role: "user", content: "run it" },
        { role: "assistant", content: "denied path" }
      ]
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("run it");
    await settle(40);
    stdin.write("\r");
    await settle(100);

    expect(lastFrame() ?? "").toMatch(/Allow exec_command\?/);
    expect(lastFrame() ?? "").toMatch(/rm -rf \//);

    stdin.write("\x1b");
    await settle(100);

    expect(approvalResult).toBe(false);
    expect(lastFrame() ?? "").toContain("denied path");
  });
});

function createMocks(options: {
  runTurn: HarnessSession["runTurn"];
  transcriptAfterTurn: ConversationMessage[];
}): { runtime: HarnessRuntime; session: HarnessSession } {
  const skillRegistry = new SkillRegistry([]);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-approval-test",
    maxTurns: 2,
    allowGuardedTools: false,
    systemPrompt: "test",
    tokenBudget: 1000,
    sessionEventLog: false
  };

  const runtime = {
    provider: {
      name: "mock",
      sendTurn: async () => ({ toolCalls: [], stopReason: "completed" as const })
    },
    toolRegistry: { definitions: () => [], get: () => undefined },
    skillRegistry,
    config,
    run: async () => {
      throw new Error("unused");
    },
    executeTool: async () => ({ ok: false, content: "unused" })
  } as unknown as HarnessRuntime;

  let transcript: ConversationMessage[] = [];

  const session = {
    sessionId: "test",
    sessionEventLogPath: null,
    snapshot: () => ({
      transcript: [...transcript],
      messages: [...transcript],
      context: {
        system: "",
        projectInstructions: "",
        task: "",
        environment: "",
        skillCatalog: "",
        skillInstructions: "",
        workingSet: [],
        summary: [],
        pinned: [],
        compaction: { clearedTools: false, summarized: false }
      },
      stepChecklist: null,
      plan: null,
      planMode: false,
      reasoning: [],
      history: [],
      assemblySnapshots: []
    }),
    runTurn: async (...args: Parameters<HarnessSession["runTurn"]>) => {
      const result = await options.runTurn(...args);
      transcript = options.transcriptAfterTurn;
      return result;
    },
    setStreamListener: () => undefined,
    setModelCallCompleteListener: () => undefined,
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
