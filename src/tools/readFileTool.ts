import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.js";

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description: "Read a UTF-8 file from the workspace.",
    risk: "safe",
    refetchable: true,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"]
    }
  },
  async execute(input, context) {
    const path = resolve(context.cwd, String(input.path ?? ""));
    const content = await readFile(path, "utf8");
    return {
      ok: true,
      content,
      metadata: { path }
    };
  }
};
