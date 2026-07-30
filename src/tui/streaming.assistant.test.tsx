/**
 * Feedback loop for: mid-Turn assistant streaming in the Session TUI.
 *
 * Command:
 *   npx vitest run src/tui/streaming.assistant.test.tsx
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "./App.js";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { SkillRegistry } from "../skills/registry.js";
import type { ConversationMessage, ProviderStreamDelta } from "../types.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("streaming — Session TUI mid-Turn assistant", () => {
  it("shows partial assistant content while runTurn is still pending", async () => {
    let releaseTurn!: () => void;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });

    const partialAssistant = "Hello from the strea";
    let streamListener: ((delta: ProviderStreamDelta) => void) | null = null;

    const { runtime, session } = createMocks({
      setStreamListener: (listener) => {
        streamListener = listener;
      },
      runTurn: async () => {
        await settle(30);
        streamListener?.({ kind: "assistant_text", text: partialAssistant });
        await settle(30);
        await turnGate;
        return {
          output: `${partialAssistant}ming model.`,
          events: [],
          finalState: "DONE",
          stepChecklist: { goal: "test", steps: [] },
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
    await settle(120);

    const midTurnFrame = lastFrame() ?? "";
    expect(midTurnFrame, "Turn in progress").toMatch(/running/i);
    expect(
      midTurnFrame,
      "partial assistant text must be visible mid-Turn (streaming UX)"
    ).toContain(partialAssistant);
    expect(midTurnFrame, "thinking spinner stays while streaming").toMatch(
      /thinking…/
    );

    releaseTurn();
    await settle(80);
  });

  it("shows Reasoning draft while runTurn is still pending", async () => {
    let releaseTurn!: () => void;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });

    const reasoningChunk = "consider the cwd first";
    let streamListener: ((delta: ProviderStreamDelta) => void) | null = null;

    const { runtime, session } = createMocks({
      setStreamListener: (listener) => {
        streamListener = listener;
      },
      runTurn: async () => {
        await settle(30);
        streamListener?.({ kind: "reasoning", text: reasoningChunk });
        await settle(30);
        await turnGate;
        return {
          output: "done",
          events: [],
          finalState: "DONE",
          stepChecklist: { goal: "test", steps: [] },
          plan: { goal: "test", steps: [] }
        };
      }
    });

    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("think");
    await settle(40);
    stdin.write("\r");
    await settle(120);

    const midTurnFrame = lastFrame() ?? "";
    expect(midTurnFrame).toMatch(/running/i);
    expect(midTurnFrame).toContain(reasoningChunk);
    expect(midTurnFrame).toMatch(/reasoning/i);

    releaseTurn();
    await settle(80);
  });
});

function createMocks(overrides: {
  runTurn: HarnessSession["runTurn"];
  setStreamListener?: HarnessSession["setStreamListener"];
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
      stepChecklist: null,
      plan: null,
      planMode: false,
      reasoning: [],
      history: [],
      assemblySnapshots: []
    }),
    runTurn: overrides.runTurn,
    setStreamListener: overrides.setStreamListener ?? (() => undefined),
    setModelCallCompleteListener: () => undefined,
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
