#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { cwd, env, stdin, stdout } from "node:process";
import { resolve } from "node:path";
import { createCliRuntime, parseCliArgs } from "./cliConfig.js";
import { defaultDumpPromptsDir } from "./context/promptDump.js";
import {
  createDefaultSystemPrompt,
  createHarnessSession,
  HarnessRuntime,
  type HarnessSession
} from "./runtime/harness.js";
import { formatSessionBanner } from "./sessionBanner.js";
import { createDefaultTools } from "./tools/defaultTools.js";
import type { Provider } from "./types.js";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const cli = createCliRuntime(args, env);

  if (cli.dumpPrompts) {
    const dumpDir =
      cli.dumpPromptsDir ?? defaultDumpPromptsDir(cwd());
    stdout.write(`Prompt dumps enabled → ${resolve(dumpDir)}\n`);
  }

  if (cli.prompt) {
    const runtime = createRuntime(cli, "command");
    const session = createHarnessSession(runtime);
    announceSessionEventLog(session);
    try {
      const result = await session.runTurn(cli.prompt);
      stdout.write(`${result.output}\n`);
    } finally {
      session.end();
    }
    return;
  }

  const runtime = createRuntime(cli, "repl");
  await runRepl(runtime);
}

async function runRepl(runtime: HarnessRuntime) {
  const session = createHarnessSession(runtime);
  announceSessionEventLog(session);
  const rl = createInterface({
    input: stdin,
    output: stdout
  });

  runtime.config.confirmSkillScript = async (request) => {
    const answer = (
      await rl.question(
        `Run user Skill script ${request.skillName}:${request.script}? [y/N] `
      )
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  };

  writeSessionBanner();

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
        session.clear();
        stdout.write("\x1Bc");
        writeSessionBanner();
        continue;
      }

      if (line === "context") {
        stdout.write(session.formatContextInventory());
        continue;
      }

      const result = await session.runTurn(line);
      stdout.write(`${result.output}\n`);
    }
  } finally {
    session.end();
    rl.close();
  }
}

function announceSessionEventLog(session: HarnessSession) {
  if (session.sessionEventLogPath) {
    stdout.write(`Session event log → ${session.sessionEventLogPath}\n`);
  }
}

function writeSessionBanner() {
  stdout.write(
    formatSessionBanner({
      isTTY: stdout.isTTY === true,
      columns: stdout.columns,
      noColor: Boolean(env.NO_COLOR)
    })
  );
}

function createRuntime(
  cli: {
    provider: Provider;
    allowGuardedTools: boolean;
    dumpPrompts: boolean;
    dumpPromptsDir?: string;
    sessionEventLog: boolean;
    sessionEventLogDir?: string;
  },
  sessionMode: "repl" | "command"
) {
  return new HarnessRuntime(cli.provider, createDefaultTools(), {
    cwd: cwd(),
    maxTurns: 4,
    allowGuardedTools: cli.allowGuardedTools,
    systemPrompt: createDefaultSystemPrompt(),
    tokenBudget: 24_000,
    dumpPrompts: cli.dumpPrompts,
    dumpPromptsDir: cli.dumpPromptsDir
      ? resolve(cli.dumpPromptsDir)
      : undefined,
    sessionEventLog: cli.sessionEventLog,
    sessionEventLogDir: cli.sessionEventLogDir
      ? resolve(cli.sessionEventLogDir)
      : undefined,
    sessionMode,
    skillsHomeDir: env.HONEY_SKILLS_HOME
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
