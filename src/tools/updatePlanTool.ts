import type { Tool } from "../types.js";
import { UPDATE_PLAN_TOOL_NAME } from "../runtime/planMode.js";

export const updatePlanTool: Tool = {
  definition: {
    name: UPDATE_PLAN_TOOL_NAME,
    description:
      "Write or replace the Session Plan document (Markdown). Does not modify the workspace. Prefer sections: Goal, Scope, Approach, Acceptance, Risks / Open questions.",
    risk: "safe",
    inputSchema: {
      type: "object",
      properties: {
        markdown: {
          type: "string",
          description: "Full Markdown body of the Plan document"
        }
      },
      required: ["markdown"]
    }
  },
  async execute(input, context) {
    if (!context.updatePlanDocument) {
      return {
        ok: false,
        content: "update_plan is only available in Plan Mode"
      };
    }
    const markdown = String(input.markdown ?? "").trim();
    if (!markdown) {
      return {
        ok: false,
        content: "update_plan requires a non-empty markdown string"
      };
    }
    context.updatePlanDocument(markdown);
    return {
      ok: true,
      content: `Plan document updated (${markdown.length} characters).`,
      metadata: { characters: markdown.length }
    };
  }
};
