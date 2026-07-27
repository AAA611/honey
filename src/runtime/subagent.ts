/** Built-in Tool that starts a Subagent (nested Run). */
export const SPAWN_SUBAGENT_TOOL_NAME = "spawn_subagent";

/** Hard cap on Subagent result summary characters written into the parent Working set. */
export const SUBAGENT_SUMMARY_MAX_CHARS = 8_000;

export type SubagentStatus = "completed" | "error";

export interface SubagentResult {
  summary: string;
  status: SubagentStatus;
  run_id: string;
}

export function truncateSubagentSummary(summary: string): string {
  if (summary.length <= SUBAGENT_SUMMARY_MAX_CHARS) {
    return summary;
  }
  return `${summary.slice(0, SUBAGENT_SUMMARY_MAX_CHARS)}\n…[truncated]`;
}

export function formatSubagentResult(result: SubagentResult): string {
  const payload: SubagentResult = {
    summary: truncateSubagentSummary(result.summary),
    status: result.status,
    run_id: result.run_id
  };
  return JSON.stringify(payload);
}
