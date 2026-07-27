import type { ContextLayers, Plan } from "../types.js";
import type { ProjectInstructionsSources } from "./projectInstructions.js";
import { estimateAssembledTokens } from "./assemble.js";
import { estimateTokens } from "./tokens.js";

export interface ProjectInstructionsInventoryMeta {
  sources: ProjectInstructionsSources;
  truncated: boolean;
}

export function formatContextInventory(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number,
  projectInstructionsMeta?: ProjectInstructionsInventoryMeta
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
    ...formatProjectInstructionsSources(projectInstructionsMeta),
    `  Task: ${preview(layers.task)}`,
    `  Plan: ${plan ? `${plan.steps.length} steps (${plan.goal})` : "(none)"}`,
    `  Environment: ${preview(layers.environment)}`,
    `  Skill catalog: ${layers.skillCatalog.trim() ? preview(layers.skillCatalog) : "(empty)"}`,
    `  Skill instructions: ${layers.skillInstructions.trim() ? preview(layers.skillInstructions) : "(none)"}`,
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

function formatProjectInstructionsSources(
  meta: ProjectInstructionsInventoryMeta | undefined
): string[] {
  if (!meta) {
    return [];
  }
  return [
    `    user: ${meta.sources.user?.path ?? "(none)"}`,
    `    project: ${meta.sources.project?.path ?? "(none)"}`,
    `    truncated: ${meta.truncated ? "yes" : "no"}`
  ];
}

function preview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "(empty)";
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}
