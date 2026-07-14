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
import type { Provider } from "../types.js";

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
    expect(session.snapshot().messages.length).toBeGreaterThan(2);
  });

  it("can apply a guarded patch when approval is enabled", async () => {
    const dir = await makeFixtureDir();
    const filePath = join(dir, "editable.txt");
    await writeFile(filePath, "before", "utf8");
    const runtime = createRuntime(dir, true, new ScriptedProvider([
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
    ]));

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
});

function createRuntime(
  dir: string,
  allowGuardedTools = false,
  provider: Provider = new ScriptedProvider()
) {
  return new HarnessRuntime(provider, createDefaultTools(), {
    cwd: dir,
    maxTurns: 4,
    allowGuardedTools,
    systemPrompt: createDefaultSystemPrompt()
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
