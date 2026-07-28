/**
 * Feedback loop for Composer input bugs:
 * 1) Esc dismisses the slash panel
 * 2) Left/right arrows move the caret (insert in the middle)
 * 3) Selecting a slash item via Enter works for CR, LF, and Kitty CSI-u
 *
 * Command:
 *   npx vitest run src/tui/composer.input.test.tsx
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionTuiApp } from "./App.js";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { SkillRegistry } from "../skills/registry.js";
import type { SkillManifest } from "../skills/types.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0, cleanups.length)) {
    cleanup();
  }
});

function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("composer slash Esc dismiss", () => {
  it("closes the skill panel on Esc after /", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    stdin.write("\u001b");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("/context —");
    expect(frame).not.toMatch(/honey›\s*\//);
  });
});

describe("composer caret left/right", () => {
  it("inserts in the middle after moving left", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("abc");
    await settle(80);
    // Move left twice: caret between a and b? "abc" → left → "ab|c" → left → "a|bc"
    stdin.write("\u001b[D");
    stdin.write("\u001b[D");
    await settle(40);
    stdin.write("X");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "caret insert must yield aXbc").toMatch(/honey›\s*aXbc/);
  });
});

describe("composer slash select Enter forms", () => {
  it("applies the selected skill on CR Enter", async () => {
    const { runtime, session } = createMocks([sampleSkill()]);
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/skill-guide");
    await settle(80);
    expect(lastFrame()).toContain("/skill-guide");

    stdin.write("\r");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/honey›\s*\$skill-guide /);
    expect(frame).not.toContain("/context —");
  });

  it("applies the selected skill on LF Enter (Ink name=enter)", async () => {
    const { runtime, session } = createMocks([sampleSkill()]);
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/skill-guide");
    await settle(80);

    stdin.write("\n");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "LF must select like CR").toMatch(/honey›\s*\$skill-guide /);
  });

  it("applies the selected skill on Kitty CSI-u Enter ([13;1:3u])", async () => {
    const { runtime, session } = createMocks([sampleSkill()]);
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/skill-guide");
    await settle(80);

    stdin.write("\u001b[13;1:3u");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "Kitty Enter must select").toMatch(/honey›\s*\$skill-guide /);
  });

  it("applies the selected skill on bare Kitty Enter ([13u]) without crashing Ink", async () => {
    const { runtime, session } = createMocks([sampleSkill()]);
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/skill-guide");
    await settle(80);

    // Ink's useInput throws on this form (ctrl=true, input=undefined) unless we
    // normalize CSI-u before parseKeypress.
    stdin.write("\u001b[13u");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "bare Kitty Enter must select").toMatch(
      /honey›\s*\$skill-guide /
    );
  });

  it("runs /context on Kitty Enter when that command is selected", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/context");
    await settle(80);
    stdin.write("\u001b[13;1:3u");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("inventory");
    expect(frame).not.toContain("/context —");
  });

  it("runs /context a second time and shows a fresh notice", async () => {
    let calls = 0;
    const { runtime, session } = createMocks();
    // Same body both times — the visible #N header must still change.
    session.formatContextInventory = () => {
      calls += 1;
      return "inventory-same-body";
    };
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/context");
    await settle(80);
    stdin.write("\r");
    await settle(80);
    expect(lastFrame()).toContain("[context inventory] #1");
    expect(lastFrame()).toContain("inventory-same-body");

    stdin.write("/context");
    await settle(80);
    stdin.write("\r");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(calls, "formatContextInventory must run twice").toBe(2);
    expect(frame, "second run must bump the visible header").toContain(
      "[context inventory] #2"
    );
    expect(frame, "prior context notice must be replaced").not.toContain(
      "[context inventory] #1"
    );
  });
});

describe("composer backspace/delete", () => {
  it("deletes the previous character on DEL (0x7f — Mac Backspace)", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("abc");
    await settle(80);
    expect(lastFrame()).toMatch(/honey›\s*abc/);

    // Terminal Backspace is typically DEL (\x7f), which Ink names "delete".
    stdin.write("\x7f");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame, "Backspace/DEL must remove last char").toMatch(
      /honey›\s*ab(?:\s|│|$)/
    );
    expect(frame).not.toMatch(/honey›\s*abc/);
  });

  it("deletes while the slash overlay is open", async () => {
    const { runtime, session } = createMocks();
    const { lastFrame, stdin, unmount } = render(
      <SessionTuiApp runtime={runtime} session={session} />
    );
    cleanups.push(unmount);

    await settle();
    stdin.write("/con");
    await settle(80);
    expect(lastFrame()).toContain("/context");

    stdin.write("\x7f");
    await settle(80);

    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/honey›\s*\/co(?:\s|│|$)/);
  });
});

function sampleSkill(): SkillManifest {
  return {
    name: "skill-guide",
    description: "Explain skills",
    body: "",
    skillFilePath: "/tmp/SKILL.md",
    rootDir: "/tmp",
    scope: "bundled",
    rootKind: "honey",
    policy: { allowImplicitInvocation: true },
    scripts: [],
    references: []
  };
}

function createMocks(skills: SkillManifest[] = []): {
  runtime: HarnessRuntime;
  session: HarnessSession;
} {
  const skillRegistry = new SkillRegistry(skills);
  const config: HarnessRuntime["config"] = {
    cwd: "/tmp/honey-composer-input",
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
      history: [],
      assemblySnapshots: []
    }),
    runTurn: async () => {
      throw new Error("unused");
    },
    formatContextInventory: () => "inventory",
    reloadProjectInstructions: () => ({
      text: "",
      truncated: false,
      sources: { user: null, project: null }
    }),
    clear: () => undefined,
    end: () => undefined
  } as unknown as HarnessSession;

  return { runtime, session };
}
