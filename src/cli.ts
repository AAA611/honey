import { cwd } from "node:process";
import { ScriptedProvider } from "./providers/scriptedProvider.js";
import { HarnessRuntime, createDefaultSystemPrompt } from "./runtime/harness.js";
import { createDefaultTools } from "./tools/defaultTools.js";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  const runtime = new HarnessRuntime(new ScriptedProvider(), createDefaultTools(), {
    cwd: cwd(),
    maxTurns: 4,
    allowGuardedTools: false,
    systemPrompt: createDefaultSystemPrompt()
  });

  const result = await runtime.run(
    input || "Scripted provider is ready. Try `search: harness` or `read: CONTEXT.md`."
  );

  process.stdout.write(`${result.output}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
