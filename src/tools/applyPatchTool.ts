import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.js";

export const applyPatchTool: Tool = {
  definition: {
    name: "apply_patch",
    description: "Apply a simple string replacement patch to a UTF-8 file.",
    risk: "guarded",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        find: { type: "string" },
        replace: { type: "string" }
      },
      required: ["path", "find", "replace"]
    }
  },
  async execute(input, context) {
    const path = resolve(context.cwd, String(input.path ?? ""));
    const find = String(input.find ?? "");
    const replace = String(input.replace ?? "");
    const current = await readFile(path, "utf8");

    if (!current.includes(find)) {
      return {
        ok: false,
        content: `Patch target not found in ${path}`
      };
    }

    const next = current.replace(find, replace);
    await writeFile(path, next, "utf8");
    return {
      ok: true,
      content: `Applied patch to ${path}`,
      metadata: { path }
    };
  }
};
