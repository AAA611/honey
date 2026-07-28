/** Tools offered while Plan Mode is active (ADR-0013). */
export const PLAN_MODE_TOOL_ALLOWLIST = new Set([
  "read_file",
  "search_workspace",
  "update_plan"
]);

export const UPDATE_PLAN_TOOL_NAME = "update_plan";

export function isPlanModeToolAllowed(toolName: string): boolean {
  return PLAN_MODE_TOOL_ALLOWLIST.has(toolName);
}
