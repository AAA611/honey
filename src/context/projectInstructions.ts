import { readFileSync } from "node:fs";
import { join } from "node:path";

const CANDIDATES = ["AGENTS.md", "CONTEXT.md"] as const;
const MAX_CHARS = 6_000;

export function loadProjectInstructions(cwd: string): string {
  const chunks: string[] = [];

  for (const name of CANDIDATES) {
    try {
      const raw = readFileSync(join(cwd, name), "utf8");
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      chunks.push(`# ${name}\n${trimmed}`);
    } catch {
      // Optional files: missing is fine.
    }
  }

  const joined = chunks.join("\n\n");
  if (joined.length <= MAX_CHARS) {
    return joined;
  }

  return `${joined.slice(0, MAX_CHARS - 3)}...`;
}
