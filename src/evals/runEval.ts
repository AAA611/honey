import { cwd } from "node:process";
import { ScriptedProvider } from "../providers/scriptedProvider.js";
import { HarnessRuntime, createDefaultSystemPrompt } from "../runtime/harness.js";
import { createDefaultTools } from "../tools/defaultTools.js";

async function main() {
  const runtime = new HarnessRuntime(new ScriptedProvider(), createDefaultTools(), {
    cwd: cwd(),
    maxTurns: 4,
    allowGuardedTools: false,
    systemPrompt: createDefaultSystemPrompt(),
    tokenBudget: 24_000
  });

  const result = await runtime.run("read: CONTEXT.md");
  process.stdout.write(
    JSON.stringify(
      {
        finalState: result.finalState,
        eventCount: result.events.length,
        outputPreview: result.output.slice(0, 120)
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
