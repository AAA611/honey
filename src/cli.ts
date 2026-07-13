#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { cwd, stdin, stdout } from "node:process";
import { ScriptedProvider } from "./providers/scriptedProvider.js";
import {
  createDefaultSystemPrompt,
  createHarnessSession,
  HarnessRuntime
} from "./runtime/harness.js";
import { createDefaultTools } from "./tools/defaultTools.js";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (input) {
    const result = await createRuntime().run(input);
    stdout.write(`${result.output}\n`);
    return;
  }

  await runRepl();
}

async function runRepl() {
  const runtime = createRuntime();
  const session = createHarnessSession(runtime);
  const rl = createInterface({
    input: stdin,
    output: stdout
  });

  stdout.write("Honey REPL. Type a prompt, or use `exit` to quit.\n");

  try {
    while (true) {
      const line = (await rl.question("honey> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "exit" || line === "quit") {
        stdout.write("Bye.\n");
        break;
      }

      if (line === "clear") {
        stdout.write("\x1Bc");
        continue;
      }

      const result = await session.runTurn(line);
      stdout.write(`${result.output}\n`);
    }
  } finally {
    rl.close();
  }
}

function createRuntime() {
  return new HarnessRuntime(new ScriptedProvider(), createDefaultTools(), {
    cwd: cwd(),
    maxTurns: 4,
    allowGuardedTools: false,
    systemPrompt: createDefaultSystemPrompt()
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
