import type { ContextLayers, StepChecklist } from "../types.js";
import type { ProjectInstructionsSources } from "./projectInstructions.js";
import { estimateAssembledTokens } from "./assemble.js";
import { estimateTokens } from "./tokens.js";

export interface ProjectInstructionsInventoryMeta {
  sources: ProjectInstructionsSources;
  truncated: boolean;
}

export function formatContextInventory(
  layers: ContextLayers,
  stepChecklist: StepChecklist | null,
  tokenBudget: number,
  projectInstructionsMeta?: ProjectInstructionsInventoryMeta,
  extras?: { planDocument?: string | null; planMode?: boolean }
): string {
  const total = estimateAssembledTokens(layers, {
    stepChecklist,
    planDocument: extras?.planDocument ?? null,
    planMode: extras?.planMode ?? false
  });
  const planDoc = extras?.planDocument?.trim() ?? "";
  const lines = [
    "Context inventory",
    `token estimate: ${total} / budget ${tokenBudget}`,
    `compaction: toolsCleared=${layers.compaction.clearedTools} summarized=${layers.compaction.summarized}`,
    `planMode: ${extras?.planMode ? "on" : "off"}`,
    "",
    "Root set:",
    `  System: ${estimateTokens(layers.system)} tokens`,
    `  Project instructions: ${estimateTokens(layers.projectInstructions)} tokens`,
    ...formatProjectInstructionsSources(projectInstructionsMeta),
    `  Task: ${preview(layers.task)}`,
    `  Step checklist: ${
      stepChecklist
        ? `${stepChecklist.steps.length} steps (${stepChecklist.goal})`
        : "(none)"
    }`,
    `  Plan: ${planDoc ? preview(planDoc) : "(empty)"}`,
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
