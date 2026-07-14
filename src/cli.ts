#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { cwd, env, stdin, stdout } from "node:process";
import { createCliRuntime, parseCliArgs } from "./cliConfig.js";
import {
  createDefaultSystemPrompt,
  createHarnessSession,
  HarnessRuntime
} from "./runtime/harness.js";
import { createDefaultTools } from "./tools/defaultTools.js";
import type { Provider } from "./types.js";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const cli = createCliRuntime(args, env);
  const runtime = createRuntime(cli.provider, cli.allowGuardedTools);

  if (cli.prompt) {
    const result = await runtime.run(cli.prompt);
    stdout.write(`${result.output}\n`);
    return;
  }

  await runRepl(runtime);
}

async function runRepl(runtime: HarnessRuntime) {
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

function createRuntime(provider: Provider, allowGuardedTools: boolean) {
  return new HarnessRuntime(provider, createDefaultTools(), {
    cwd: cwd(),
    maxTurns: 4,
    allowGuardedTools,
    systemPrompt: createDefaultSystemPrompt()
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
