#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { cwd, env, stderr, stdin, stdout } from "node:process";
import { resolve } from "node:path";
import {
  isSkillPickerCommand,
  pickSkill,
  questionWithSkillPrefill
} from "./cli/skillPicker.js";
import { createCliRuntime, parseCliArgs } from "./cliConfig.js";
import { defaultDumpPromptsDir } from "./context/promptDump.js";
import { createRuntimeTools } from "./mcp/createRuntimeTools.js";
import {
  createDefaultSystemPrompt,
  createHarnessSession,
  HarnessRuntime,
  type HarnessSession
} from "./runtime/harness.js";
import { formatSessionBanner } from "./sessionBanner.js";
import { runSessionTui } from "./tui/runTui.js";
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
    const runtime = await createRuntime(cli, "command");
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

  const runtime = await createRuntime(cli, "repl");
  if (stdin.isTTY === true && stdout.isTTY === true) {
    await runTuiRepl(runtime);
  } else {
    await runLineRepl(runtime);
  }
}

async function runTuiRepl(runtime: HarnessRuntime) {
  const session = createHarnessSession(runtime);
  announceSessionEventLog(session);
  try {
    await runSessionTui({ runtime, session });
  } finally {
    session.end();
  }
}

async function runLineRepl(runtime: HarnessRuntime) {
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
    let prefillSkill: string | null = null;

    while (true) {
      const line = (
        prefillSkill
          ? await questionWithSkillPrefill(rl, "honey> ", prefillSkill)
          : await rl.question("honey> ")
      ).trim();
      prefillSkill = null;

      if (!line) {
        continue;
      }

      if (line === "exit" || line === "quit" || line === "/exit") {
        stdout.write("Bye.\n");
        break;
      }

      if (line === "clear" || line === "/clear") {
        session.clear();
        stdout.write("\x1Bc");
        writeSessionBanner();
        continue;
      }

      if (line === "context" || line === "/context") {
        stdout.write(session.formatContextInventory());
        continue;
      }

      if (isSkillPickerCommand(line)) {
        const picked = await pickSkill({
          skills: runtime.skillRegistry.list(),
          isTTY: false
        });
        if (picked.status === "empty") {
          stdout.write("No skills discovered.\n");
          continue;
        }
        if (picked.status === "cancelled") {
          continue;
        }
        prefillSkill = picked.skillName;
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

async function createRuntime(
  cli: {
    provider: Provider;
    allowGuardedTools: boolean;
    mcp: boolean;
    dumpPrompts: boolean;
    dumpPromptsDir?: string;
    sessionEventLog: boolean;
    sessionEventLogDir?: string;
  },
  sessionMode: "repl" | "command"
) {
  const tools = await createRuntimeTools({
    cwd: cwd(),
    mcp: cli.mcp,
    onWarning: (message) => {
      stderr.write(`${message}\n`);
    }
  });

  return new HarnessRuntime(cli.provider, tools, {
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
