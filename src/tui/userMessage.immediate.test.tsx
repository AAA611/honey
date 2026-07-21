/**
 * Feedback loop for: user message only appears after the Turn finishes.
 *
 * Symptom: after Enter, Transcript stays empty until runTurn resolves;
 * then user + assistant appear together.
 *
 * Command:
 *   npx vitest run src/tui/userMessage.immediate.test.tsx
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

describe("user message appears before Turn completes", () => {
  it("shows the submitted user line in Transcript while runTurn is still pending", async () => {
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
      }
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("hello world");
    await settle(40);
    stdin.write("\r");
    await settle(80);

    const midTurnFrame = lastFrame() ?? "";
    expect(midTurnFrame, "busy indicator visible mid-Turn").toMatch(/running/i);
    expect(
      midTurnFrame,
      "user message must be visible before runTurn resolves"
    ).toContain("hello world");
    expect(midTurnFrame, "role label for user").toContain("user");

    releaseTurn();
    await settle(80);
  });
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
    cwd: "/tmp/honey-user-msg-repro",
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
