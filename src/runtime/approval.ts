import type { ApprovalRequest, ToolCall } from "../types.js";

const SUMMARY_MAX = 160;

/**
 * Build a truncated Name+args summary for Approval prompts.
 */
export function formatApprovalArgumentSummary(
  args: Record<string, unknown>
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    const rendered =
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value.map(String).join(" ")
          : JSON.stringify(value);
    parts.push(`${key}=${rendered}`);
  }
  const joined = parts.join(" ");
  if (joined.length <= SUMMARY_MAX) {
    return joined;
  }
  return `${joined.slice(0, SUMMARY_MAX - 1)}…`;
}

export function createApprovalRequest(toolCall: ToolCall): ApprovalRequest {
  return {
    toolName: toolCall.toolName,
    callId: toolCall.callId,
    arguments: toolCall.arguments,
    argumentSummary: formatApprovalArgumentSummary(toolCall.arguments)
  };
}

export function formatApprovalPrompt(request: ApprovalRequest): string {
  const args = request.argumentSummary
    ? ` ${request.argumentSummary}`
    : "";
  return `Allow guarded tool ${request.toolName}?${args} [y/N]`;
}
