/**
 * Feedback loop: Composer must not stack a fake inverse caret on top of the
 * real terminal cursor from useCursor (vertical double-cursor ghosting).
 *
 * Also guards Ink #867 — nested inverse Text must not punch the bottom border.
 *
 * Command:
 *   npx vitest run src/tui/composer.cursor.test.tsx
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "../../tui/App.js";
import type { HarnessRuntime, HarnessSession } from "../../runtime/harness.js";
import { SkillRegistry } from "../../skills/registry.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when an inverse cursor leaked onto the box bottom border (Ink #867). */
function composerBottomBorderHasCursorGap(frame: string): boolean {
  const lines = frame.split("\n");
  const bottom = lines[lines.length - 1] ?? "";
  return /─ /.test(bottom);
}

describe("composer cursor stays on the input line", () => {
  it("does not punch a gap into the bottom border after typing /", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "slash overlay open").toContain("honey› /");
    expect(
      composerBottomBorderHasCursorGap(frame),
      "composer bottom border must stay intact (Ink #867)"
    ).toBe(false);
  });

  it("does not paint an inverse-space fake caret on empty Composer", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/honey› /);
    // Empty idle Composer used to render inverse(" ") as a second block caret
    // stacked with useCursor — that shows up as vertical ghosting in the TTY.
    expect(frame).not.toContain("\x1b[7m \x1b[27m");
  });
});

function createMocks(): {
  runtime: HarnessRuntime;
  session: HarnessSession;
} {
  const skillRegistry = new SkillRegistry([]);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-cursor-repro",
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

  const session = {
    sessionId: "test",
    sessionEventLogPath: null,
    snapshot: () => ({
      transcript: [],
      messages: [],
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
    runTurn: async () => {
      throw new Error("unused");
    },
    setStreamListener: () => undefined,
    setModelCallCompleteListener: () => undefined,
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
