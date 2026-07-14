import type { ContextLayers, Plan } from "../types.js";
import { estimateAssembledTokens } from "./assemble.js";
import { estimateTokens } from "./tokens.js";

export function formatContextInventory(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number
): string {
  const total = estimateAssembledTokens(layers, plan);
  const lines = [
    "Context inventory",
    `token estimate: ${total} / budget ${tokenBudget}`,
    `compaction: toolsCleared=${layers.compaction.clearedTools} summarized=${layers.compaction.summarized}`,
    "",
    "Root set:",
    `  System: ${estimateTokens(layers.system)} tokens`,
    `  Project instructions: ${estimateTokens(layers.projectInstructions)} tokens`,
    `  Task: ${preview(layers.task)}`,
    `  Plan: ${plan ? `${plan.steps.length} steps (${plan.goal})` : "(none)"}`,
    `  Environment: ${preview(layers.environment)}`,
    `  Summary: ${layers.summary.length} entries`,
    `  Pinned artifacts: ${layers.pinned.length}`,
    "",
    "Working set:",
    `  messages: ${layers.workingSet.length}`,
    "",
    "Assembled prompt:",
    `  total estimate: ${total} tokens`
  ];

  return `${lines.join("\n")}\n`;
}

function preview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "(empty)";
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}
