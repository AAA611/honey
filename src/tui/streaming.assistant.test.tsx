/**
 * Feedback loop for: no mid-Turn assistant streaming in the Session TUI.
 *
 * User symptom: while the model is generating, Transcript shows no growing
 * assistant text — only the final blob after runTurn resolves.
 *
 * Command (expect RED until streaming UX ships):
 *   npx vitest run src/tui/streaming.assistant.test.tsx
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "./App.js";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { SkillRegistry } from "../skills/registry.js";
import type { ConversationMessage } from "../types.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("streaming gap — Session TUI mid-Turn assistant", () => {
  // Known gap: no mid-Turn assistant delta channel into Transcript.
  // Remove `.fails` when Session TUI can render partial assistant content.
  it.fails(
    "shows partial assistant content while runTurn is still pending",
    async () => {
    let releaseTurn!: () => void;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });

    // Simulate a Provider that would have already emitted a first delta
    // before the Turn finishes — the TUI has no channel to show it today.
    const partialAssistant = "Hello from the strea";

    const { runtime, session } = createMocks({
      runTurn: async () => {
        await turnGate;
        return {
          output: `${partialAssistant}ming model.`,
          events: [],
          finalState: "DONE",
          plan: { goal: "test", steps: [] }
        };
      }
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("say hi");
    await settle(40);
    stdin.write("\r");
    await settle(80);

    const midTurnFrame = lastFrame() ?? "";
    expect(midTurnFrame, "Turn in progress").toMatch(/running/i);
    expect(
      midTurnFrame,
      "partial assistant text must be visible mid-Turn (streaming UX)"
    ).toContain(partialAssistant);

    releaseTurn();
    await settle(80);
  }
  );
});

function createMocks(overrides: {
  runTurn: HarnessSession["runTurn"];
  transcript?: ConversationMessage[];
}): {
  runtime: HarnessRuntime;
  session: HarnessSession;
} {
  const skillRegistry = new SkillRegistry([]);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-stream-repro",
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

  const transcript = overrides.transcript ?? [];

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
      plan: null,
      history: [],
      assemblySnapshots: []
    }),
    runTurn: overrides.runTurn,
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
