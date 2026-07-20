import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "../types.js";

const execFileAsync = promisify(execFile);

export const runTestsTool: Tool = {
  definition: {
    name: "run_tests",
    description: "Run a test command inside the workspace.",
    risk: "guarded",
    refetchable: true,
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" }
      },
      required: ["command"]
    }
  },
  async execute(input, context) {
    const command = String(input.command ?? "npm test");
    try {
      const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
        cwd: context.cwd,
        maxBuffer: 1024 * 1024
      });
      return {
        ok: true,
        content: [stdout, stderr].filter(Boolean).join("\n")
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown test execution failure";
      return {
        ok: false,
        content: message
      };
    }
  }
};
