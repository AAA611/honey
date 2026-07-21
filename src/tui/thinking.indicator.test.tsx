/**
 * Feedback loop for: no AI thinking animation while the Turn is pending.
 *
 * Symptom: after Enter, StatusBar shows static "running…" but Transcript has
 * no animated thinking indicator until the assistant reply lands.
 *
 * Command:
 *   npx vitest run src/tui/thinking.indicator.test.tsx
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

describe("AI thinking indicator while Turn is pending", () => {
  it("shows a thinking indicator mid-Turn and clears it when done", async () => {
    let releaseTurn!: () => void;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });

    const { runtime, session } = createMocks({
      runTurn: async () => {
        await turnGate;
        return {
          output: "done",
          events: [],
          finalState: "DONE",
          plan: { goal: "test", steps: [] }
        };
      },
      transcriptAfterTurn: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done" }
      ]
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("hello");
    await settle(40);
    stdin.write("\r");
    await settle(80);

    const midTurnFrame = lastFrame() ?? "";
    expect(midTurnFrame, "busy mid-Turn").toMatch(/running/i);
    expect(
      midTurnFrame,
      "thinking indicator must be visible while waiting for the model"
    ).toMatch(/thinking…/);

    releaseTurn();
    await settle(80);

    const doneFrame = lastFrame() ?? "";
    expect(doneFrame).toContain("done");
    expect(
      doneFrame,
      "thinking indicator must clear after the Turn finishes"
    ).not.toMatch(/thinking…/);
  });
});

function createMocks(overrides: {
  runTurn: HarnessSession["runTurn"];
  transcript?: ConversationMessage[];
  transcriptAfterTurn?: ConversationMessage[];
}): {
  runtime: HarnessRuntime;
  session: HarnessSession;
} {
  const skillRegistry = new SkillRegistry([]);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-busy-indicator-repro",
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

  let transcript = overrides.transcript ?? [];

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
    runTurn: async (...args: Parameters<HarnessSession["runTurn"]>) => {
      const result = await overrides.runTurn(...args);
      if (overrides.transcriptAfterTurn) {
        transcript = overrides.transcriptAfterTurn;
      }
      return result;
    },
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
