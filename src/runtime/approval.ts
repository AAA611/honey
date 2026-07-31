import type { ApprovalRequest, ToolCall } from "../types.js";

const SUMMARY_MAX = 160;
const FIELD_MAX = 72;
const DETAIL_FIELD_MAX = 240;
const DETAIL_LINES_MAX = 6;

export type ApprovalView = {
  /** Short decision question, e.g. "Allow apply_patch?" */
  headline: string;
  /** Structured review lines for Session TUI (not a full diff UI). */
  details: string[];
  /** Key hint shown under the panel. */
  hint: string;
  /** One-line Name+args for REPL / Session events. */
  summary: string;
};

/**
 * Build a truncated Name+args summary for Approval prompts and events.
 * Prefer tool-specific fields so the cap keeps the decisive bits visible.
 */
export function formatApprovalArgumentSummary(
  toolName: string,
  args: Record<string, unknown>
): string {
  const parts = summaryPartsForTool(toolName, args);
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
    argumentSummary: formatApprovalArgumentSummary(
      toolCall.toolName,
      toolCall.arguments
    )
  };
}

export function formatApprovalPrompt(request: ApprovalRequest): string {
  const args = request.argumentSummary ? ` ${request.argumentSummary}` : "";
  return `Allow ${request.toolName}?${args} [y/N]`;
}

/**
 * Structured Approval view for Session TUI hosts.
 * Still Name+args scope (ADR-0009) — not a full file diff.
 */
export function formatApprovalView(request: ApprovalRequest): ApprovalView {
  return {
    headline: `Allow ${request.toolName}?`,
    details: detailLinesForTool(request.toolName, request.arguments),
    hint: "y allow  ·  n / Esc / Enter deny",
    summary: request.argumentSummary
  };
}

function summaryPartsForTool(
  toolName: string,
  args: Record<string, unknown>
): string[] {
  switch (toolName) {
    case "apply_patch":
      return compactPairs([
        ["path", args.path],
        ["find", args.find],
        ["replace", args.replace]
      ]);
    case "exec_command":
      return compactPairs(execCommandPairs(args));
    case "run_tests":
      return compactPairs([["command", args.command]]);
    case "run_skill_script":
      return compactPairs([
        ["skill", args.skill],
        ["script", args.script],
        ["args", args.args]
      ]);
    case "spawn_subagent":
      return compactPairs([["prompt", args.prompt]]);
    default:
      return compactPairs(
        Object.entries(args).map(([key, value]) => [key, value] as const)
      );
  }
}

function detailLinesForTool(
  toolName: string,
  args: Record<string, unknown>
): string[] {
  switch (toolName) {
    case "apply_patch":
      return [
        labeled("path", args.path, DETAIL_FIELD_MAX),
        labeledBlock("− find", args.find),
        labeledBlock("+ replace", args.replace)
      ].filter(Boolean) as string[];
    case "exec_command":
      return execCommandPairs(args)
        .map(([key, value]) => labeled(key, value, DETAIL_FIELD_MAX))
        .filter(Boolean) as string[];
    case "run_tests":
      return [labeled("command", args.command, DETAIL_FIELD_MAX)].filter(
        Boolean
      ) as string[];
    case "run_skill_script":
      return [
        labeled("skill", args.skill, DETAIL_FIELD_MAX),
        labeled("script", args.script, DETAIL_FIELD_MAX),
        labeled("args", args.args, DETAIL_FIELD_MAX)
      ].filter(Boolean) as string[];
    case "spawn_subagent":
      return [labeledBlock("prompt", args.prompt)].filter(Boolean) as string[];
    default:
      return Object.entries(args)
        .map(([key, value]) => labeled(key, value, DETAIL_FIELD_MAX))
        .filter(Boolean) as string[];
  }
}

function execCommandPairs(
  args: Record<string, unknown>
): Array<readonly [string, unknown]> {
  const action = asString(args.action);
  const pairs: Array<readonly [string, unknown]> = [["action", args.action]];
  if (action === "start" || action === "") {
    pairs.push(["command", args.command]);
  } else if (action === "write") {
    pairs.push(["input", args.input]);
  } else if (action === "snapshot" || action === "terminate") {
    // action alone is enough; sessionId is internal noise for Approval.
  } else {
    for (const [key, value] of Object.entries(args)) {
      if (key === "action" || key === "sessionId") {
        continue;
      }
      pairs.push([key, value]);
    }
  }
  return pairs;
}

function compactPairs(
  pairs: Array<readonly [string, unknown]>
): string[] {
  const parts: string[] = [];
  for (const [key, value] of pairs) {
    if (key === "sessionId") {
      continue;
    }
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    parts.push(`${key}=${truncate(renderValue(value), FIELD_MAX)}`);
  }
  return parts;
}

function labeled(
  key: string,
  value: unknown,
  max: number
): string | null {
  if (key === "sessionId") {
    return null;
  }
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (Array.isArray(value) && value.length === 0) {
    return null;
  }
  return `${key.padEnd(8)} ${truncate(renderValue(value), max)}`;
}

function labeledBlock(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const raw = renderValue(value);
  const clipped = clipMultiline(raw, DETAIL_FIELD_MAX, DETAIL_LINES_MAX);
  const indent = " ".repeat(Math.min(key.length, 10) + 1);
  const [first, ...rest] = clipped.split("\n");
  if (rest.length === 0) {
    return `${key.padEnd(10)}${first}`;
  }
  return [`${key.padEnd(10)}${first}`, ...rest.map((line) => `${indent}${line}`)].join(
    "\n"
  );
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(String).join(" ");
  }
  return JSON.stringify(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, max - 1)}…`;
}

function clipMultiline(value: string, maxChars: number, maxLines: number): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const kept = lines.slice(0, maxLines);
  let text = kept.join("\n");
  let truncated = lines.length > maxLines;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 1)}…`;
    truncated = true;
  } else if (truncated) {
    text = `${text}\n…`;
  }
  return text;
}
