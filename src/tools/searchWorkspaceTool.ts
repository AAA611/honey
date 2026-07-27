import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "../types.js";
import { isPathInsideRoot } from "../runtime/workspaceBound.js";

export const searchWorkspaceTool: Tool = {
  definition: {
    name: "search_workspace",
    description: "Search the workspace for a text pattern.",
    risk: "safe",
    refetchable: true,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  async execute(input, context) {
    const query = String(input.query ?? "");
    const matches: string[] = [];
    const root = await realpath(context.cwd);
    const enforceBound = context.workspaceBound !== false;
    await walk(root, root, enforceBound, async (fullPath) => {
      const content = await readFile(fullPath, "utf8").catch(() => null);
      if (!content || !content.includes(query)) {
        return;
      }

      matches.push(relative(root, fullPath));
    });

    return {
      ok: true,
      content: matches.length > 0 ? matches.join("\n") : "No matches found.",
      metadata: { count: matches.length }
    };
  }
};

async function walk(
  root: string,
  dir: string,
  enforceBound: boolean,
  onFile: (fullPath: string) => Promise<void>
) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = await realpath(fullPath).catch(() => null);
      if (!target) {
        continue;
      }
      if (enforceBound && !isPathInsideRoot(root, target)) {
        continue;
      }
      const info = await stat(target).catch(() => null);
      if (!info) {
        continue;
      }
      if (info.isDirectory()) {
        await walk(root, target, enforceBound, onFile);
      } else if (info.size <= 128_000) {
        await onFile(target);
      }
      continue;
    }

    if (entry.isDirectory()) {
      await walk(root, fullPath, enforceBound, onFile);
      continue;
    }

    const info = await stat(fullPath);
    if (info.size > 128_000) {
      continue;
    }

    await onFile(fullPath);
  }
}
