import type {
  ContextLayers,
  ConversationMessage,
  Plan,
  SummaryWriter
} from "../types.js";
import { estimateAssembledTokens } from "./assemble.js";

const MAX_TOOL_RESULT_CHARS = 800;
const REFETCHABLE_TOOLS = new Set([
  "read_file",
  "search_workspace",
  "run_tests"
]);

export const deterministicSummaryWriter: SummaryWriter = {
  write(messages: ConversationMessage[]): string {
    return messages
      .map((message) => {
        if (message.role === "tool") {
          return `tool:${message.toolName}:${message.ok ? "ok" : "err"}:${truncate(message.content, 80)}`;
        }
        return `${message.role}:${truncate(message.content, 80)}`;
      })
      .join(" | ");
  }
};

export function compactIfNeeded(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number,
  summaryWriter: SummaryWriter = deterministicSummaryWriter
): ContextLayers {
  let next: ContextLayers = {
    ...layers,
    workingSet: layers.workingSet.map((message) => ({ ...message })),
    summary: [...layers.summary],
    pinned: layers.pinned.map((item) => ({ ...item })),
    compaction: { ...layers.compaction }
  };

  if (estimateAssembledTokens(next, plan) <= tokenBudget) {
    return next;
  }

  next = clearRefetchableToolResults(next);
  next.compaction = { ...next.compaction, clearedTools: true };

  if (estimateAssembledTokens(next, plan) <= tokenBudget) {
    return next;
  }

  return summarizeOverflow(next, plan, tokenBudget, summaryWriter);
}

function clearRefetchableToolResults(layers: ContextLayers): ContextLayers {
  const workingSet = layers.workingSet.map((message) => {
    if (message.role !== "tool") {
      return message;
    }
    if (!REFETCHABLE_TOOLS.has(message.toolName)) {
      return shrinkToolContent(message);
    }
    if (message.content.length <= MAX_TOOL_RESULT_CHARS) {
      return message;
    }
    return {
      ...message,
      content: `[cleared refetchable ${message.toolName} result; re-read if needed] ${truncate(message.content, 120)}`
    };
  });

  return { ...layers, workingSet };
}

function shrinkToolContent(message: ConversationMessage): ConversationMessage {
  if (message.role !== "tool") {
    return message;
  }
  if (message.content.length <= MAX_TOOL_RESULT_CHARS) {
    return message;
  }
  return {
    ...message,
    content: truncate(message.content, MAX_TOOL_RESULT_CHARS)
  };
}

function summarizeOverflow(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number,
  summaryWriter: SummaryWriter
): ContextLayers {
  let workingSet = [...layers.workingSet];
  const summary = [...layers.summary];

  while (
    workingSet.length > 2 &&
    estimateAssembledTokens({ ...layers, workingSet, summary }, plan) > tokenBudget
  ) {
    const splitAt = findPairSafeSplit(workingSet);
    if (splitAt <= 0) {
      break;
    }
    const overflow = workingSet.slice(0, splitAt);
    workingSet = workingSet.slice(splitAt);
    summary.push(summaryWriter.write(overflow));
  }

  while (
    estimateAssembledTokens({ ...layers, workingSet, summary }, plan) >
      tokenBudget &&
    workingSet.some(
      (message) => message.role === "tool" && message.content.length > 160
    )
  ) {
    workingSet = workingSet.map((message) => {
      if (message.role !== "tool" || message.content.length <= 160) {
        return message;
      }
      return { ...message, content: truncate(message.content, 160) };
    });
  }

  return {
    ...layers,
    workingSet,
    summary,
    compaction: {
      clearedTools: true,
      summarized: true
    }
  };
}

/** Prefer a split that leaves Working set starting on user/assistant, never an orphan tool result. */
function findPairSafeSplit(workingSet: ConversationMessage[]): number {
  if (workingSet.length <= 2) {
    return 0;
  }

  const maxSplit = workingSet.length - 2;
  for (let index = maxSplit; index >= 1; index -= 1) {
    if (workingSet[index]?.role === "tool") {
      continue;
    }
    return index;
  }

  return 0;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
