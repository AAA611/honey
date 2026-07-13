import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "../types.js";

export const searchWorkspaceTool: Tool = {
  definition: {
    name: "search_workspace",
    description: "Search the workspace for a text pattern.",
    risk: "safe",
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
    await walk(context.cwd, async (fullPath) => {
      const content = await readFile(fullPath, "utf8").catch(() => null);
      if (!content || !content.includes(query)) {
        return;
      }

      matches.push(relative(context.cwd, fullPath));
    });

    return {
      ok: true,
      content: matches.length > 0 ? matches.join("\n") : "No matches found.",
      metadata: { count: matches.length }
    };
  }
};

async function walk(root: string, onFile: (fullPath: string) => Promise<void>) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
      continue;
    }

    const info = await stat(fullPath);
    if (info.size > 128_000) {
      continue;
    }

    await onFile(fullPath);
  }
}
