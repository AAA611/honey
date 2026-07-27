import { readFile } from "node:fs/promises";
import type { Tool } from "../types.js";
import { resolveToolPath } from "../runtime/workspaceBound.js";

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description: "Read a UTF-8 file from the workspace.",
    risk: "safe",
    pathParams: ["path"],
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
    const rawPath = String(input.path ?? "");
    const pathResult = await resolveToolPath(
      context.cwd,
      rawPath,
      context.workspaceBound
    );
    if (!pathResult.ok) {
      return { ok: false, content: pathResult.reason };
    }
    const path = pathResult.absolutePath;
    const content = await readFile(path, "utf8");
    return {
      ok: true,
      content,
      metadata: { path }
    };
  }
};
