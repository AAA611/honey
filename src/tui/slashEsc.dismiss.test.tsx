/**
 * Feedback loop for slash Esc dismiss.
 *
 * Command:
 *   npx vitest run src/tui/slashEsc.dismiss.test.tsx
 */
import React, { useState } from "react";
import { Text, useInput } from "ink";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "./App.js";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { SkillRegistry } from "../skills/registry.js";
import { isSlashDismissKey } from "./keys.js";
import parseKeypress from "../../node_modules/ink/build/parse-keypress.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal Ink input probe — proves testing-library stdin reaches useInput. */
function InputProbe(): React.ReactElement {
  const [value, setValue] = useState("");
  useInput((input, key) => {
    if (isSlashDismissKey(input, key) || (key.ctrl && input === "c")) {
      setValue("");
      return;
    }
    if (input) {
      setValue((current) => `${current}${input}`);
    }
  });
  return <Text>VALUE={JSON.stringify(value)} ESC={String(value === "")}</Text>;
}

describe("Phase1 — Ink stdin plumbing", () => {
  it("receives / via ink-testing-library stdin.write", async () => {
    const { lastFrame, stdin, unmount } = render(<InputProbe />);
    cleanups.push(unmount);
    await settle(); // useInput must subscribe before write
    stdin.write("/");
    await settle();
    expect(lastFrame()).toContain('VALUE="/"');
  });

  it("Ink parseKeypress marks bare ESC as escape", () => {
    const key = parseKeypress("\u001b");
    expect(key.name).toBe("escape");
  });

  it("InputProbe clears value on Esc", async () => {
    const { lastFrame, stdin, unmount } = render(<InputProbe />);
    cleanups.push(unmount);
    await settle();
    stdin.write("/");
    await settle();
    expect(lastFrame()).toContain('VALUE="/"');
    stdin.write("\u001b");
    await settle();
    expect(lastFrame()).toContain('VALUE=""');
  });
});

describe("slash Esc dismiss (Ink stdin path)", () => {
  it("hides the slash overlay when Esc is written to stdin after /", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);

    const openFrame = lastFrame() ?? "";
    expect(openFrame, "overlay should open after /").toContain("honey› /");
    expect(openFrame, "overlay list visible").toContain("/context");

    stdin.write("\u001b");
    await settle(80);

    const closedFrame = lastFrame() ?? "";
    // Composer must clear the leading /
    expect(closedFrame, "composer cleared").toContain("honey›");
    expect(closedFrame, "no slash query in composer").not.toMatch(/honey›\s*\//);
    // Overlay chrome gone
    expect(closedFrame).not.toContain("/context —");
  });

  /**
   * Cursor/VS Code integrated terminal often enables Kitty keyboard protocol,
   * which encodes Esc as CSI u (`\x1b[27u`) instead of bare `\x1b`.
   * Ink's parseKeypress does not set key.escape for that — this is the user bug.
   * Event-type forms (`[27;1:3u`) and split reads must also dismiss without
   * polluting the Composer (otherwise the list filters to empty).
   */
  it("hides the slash overlay when Kitty-encoded Esc (CSI u) arrives after /", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    stdin.write("\u001b[27u");
    await settle(80);

    const closedFrame = lastFrame() ?? "";
    expect(closedFrame, "composer must not keep / or kitty garbage").not.toMatch(
      /honey›\s*\//
    );
    expect(closedFrame).not.toContain("/context —");
    expect(closedFrame).not.toContain("[27u");
  });

  it("dismisses on Kitty Esc with event-type params ([27;1:3u])", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    stdin.write("\u001b[27;1:3u");
    await settle(80);

    const closedFrame = lastFrame() ?? "";
    expect(closedFrame).not.toMatch(/honey›\s*\//);
    expect(closedFrame).not.toContain("/context —");
    expect(closedFrame).not.toContain("[27");
  });

  it("dismisses when Kitty Esc arrives as split stdin chunks", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    // Ink may deliver `\x1b[` then `27;1:3u` as separate readable chunks.
    // Second chunk must arrive before the lone-`[` timeout dismiss (40ms).
    stdin.write("\u001b[");
    stdin.write("27;1:3u");
    await settle(80);

    const closedFrame = lastFrame() ?? "";
    expect(closedFrame, "must not leave CSI garbage in composer").not.toMatch(
      /honey›\s*\//
    );
    expect(closedFrame).not.toContain("/context —");
    expect(closedFrame).not.toContain("[27");
  });

  it("dismisses after a lone CSI `[` fragment times out (split Esc with no follow-up)", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    // Ink delivers `\x1b[` as input "[" with escape=false.
    stdin.write("\u001b[");
    await settle(120);

    const closedFrame = lastFrame() ?? "";
    expect(closedFrame).not.toContain("/context —");
    expect(closedFrame).not.toMatch(/honey›\s*\//);
  });
});

function createMocks(): {
  runtime: HarnessRuntime;
  session: HarnessSession;
} {
  const skillRegistry = new SkillRegistry([]);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-esc-repro",
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
      plan: null,
      history: [],
      assemblySnapshots: []
    }),
    runTurn: async () => {
      throw new Error("unused");
    },
    formatContextInventory: () => "inventory",
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
