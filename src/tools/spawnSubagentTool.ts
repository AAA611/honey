import type { Tool } from "../types.js";
import { SPAWN_SUBAGENT_TOOL_NAME } from "../runtime/subagent.js";

export const spawnSubagentTool: Tool = {
  definition: {
    name: SPAWN_SUBAGENT_TOOL_NAME,
    description:
      "Delegate a self-contained subtask to a Subagent (nested Run) with an isolated Assembled prompt. Pass a full prompt; the Subagent does not see the parent chat history. Returns a capped JSON Subagent result (summary, status, run_id).",
    risk: "guarded",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Self-contained task instructions for the Subagent."
        }
      },
      required: ["prompt"]
    }
  },
  async execute(input, context) {
    const prompt = String(input.prompt ?? "").trim();
    if (!prompt) {
      return {
        ok: false,
        content: "spawn_subagent requires a non-empty prompt"
      };
    }
    if (!context.runSubagent) {
      return {
        ok: false,
        content:
          "spawn_subagent is unavailable in this Run (Subagent depth is 1; nested spawn is not allowed)"
      };
    }
    return context.runSubagent(prompt);
  }
};
