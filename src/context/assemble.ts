import type {
  AssemblySnapshot,
  ContextLayers,
  ConversationMessage,
  StepChecklist
} from "../types.js";
import { estimateMessageTokens, estimateTokens } from "./tokens.js";

export interface AssemblePromptOptions {
  stepChecklist: StepChecklist | null;
  planDocument?: string | null;
  planMode?: boolean;
}

/**
 * 把分层上下文拼成发给 Provider 的「系统侧」整段文本（Assembled prompt 的 Root 部分）。
 */
export function assembleSystemPrompt(
  layers: ContextLayers,
  options: AssemblePromptOptions | StepChecklist | null
): string {
  const resolved = resolveAssembleOptions(options);
  const sections = [
    layers.system,
    resolved.planMode
      ? section(
          "Plan Mode",
          [
            "Workspace is read-only.",
            "Explore with read_file and search_workspace.",
            "Write the Plan document via update_plan (Markdown: Goal, Scope, Approach, Acceptance, Risks / Open questions).",
            "Do not modify files."
          ].join(" ")
        )
      : "",
    section("Project instructions", layers.projectInstructions),
    section("Task", layers.task),
    section("Step checklist", formatStepChecklist(resolved.stepChecklist)),
    section(
      "Plan",
      resolved.planMode
        ? resolved.planDocument?.trim()
          ? resolved.planDocument
          : "(empty — call update_plan with the Markdown Plan)"
        : ""
    ),
    section("Environment", layers.environment),
    section("Skill catalog", layers.skillCatalog),
    section("Skill instructions", layers.skillInstructions),
    section("Summary", layers.summary.join("\n")),
    section("Pinned artifacts", formatPinned(layers.pinned))
  ];

  return sections.filter(Boolean).join("\n\n");
}

export function assembleProviderMessages(
  layers: ContextLayers
): ConversationMessage[] {
  return layers.workingSet.map((message) => ({ ...message }));
}

export function estimateAssembledTokens(
  layers: ContextLayers,
  options: AssemblePromptOptions | StepChecklist | null
): number {
  const systemTokens = estimateTokens(assembleSystemPrompt(layers, options));
  const messageTokens = layers.workingSet.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0
  );
  return systemTokens + messageTokens;
}

export function createAssemblySnapshot(
  layers: ContextLayers,
  options: AssemblePromptOptions | StepChecklist | null
): AssemblySnapshot {
  const resolved = resolveAssembleOptions(options);
  return {
    timestamp: new Date().toISOString(),
    tokenEstimate: estimateAssembledTokens(layers, resolved),
    compaction: { ...layers.compaction },
    layers: {
      system: layers.system,
      projectInstructions: layers.projectInstructions,
      task: layers.task,
      environment: layers.environment,
      skillCatalog: layers.skillCatalog,
      skillInstructions: layers.skillInstructions,
      summary: [...layers.summary],
      workingSetCount: layers.workingSet.length,
      workingSetRoles: layers.workingSet.map((message) => message.role),
      pinned: layers.pinned.map((item) => ({ ...item })),
      planGoal: resolved.stepChecklist?.goal ?? null,
      planSteps:
        resolved.stepChecklist?.steps.map((step) => ({
          id: step.id,
          status: step.status
        })) ?? [],
      planDocument: resolved.planDocument?.trim() ? resolved.planDocument : null,
      planMode: resolved.planMode
    }
  };
}

function resolveAssembleOptions(
  options: AssemblePromptOptions | StepChecklist | null
): AssemblePromptOptions & { planMode: boolean; planDocument: string | null } {
  if (options === null || isStepChecklist(options)) {
    return {
      stepChecklist: options,
      planDocument: null,
      planMode: false
    };
  }
  return {
    stepChecklist: options.stepChecklist,
    planDocument: options.planDocument ?? null,
    planMode: Boolean(options.planMode)
  };
}

function isStepChecklist(
  value: AssemblePromptOptions | StepChecklist
): value is StepChecklist {
  return "steps" in value && Array.isArray(value.steps) && "goal" in value;
}

function section(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "";
  }
  return `${title}:\n${trimmed}`;
}

function formatStepChecklist(checklist: StepChecklist | null): string {
  if (!checklist) {
    return "";
  }

  return checklist.steps
    .map((step) => `- [${step.status}] ${step.id}: ${step.title}`)
    .join("\n");
}

function formatPinned(pinned: ContextLayers["pinned"]): string {
  if (pinned.length === 0) {
    return "";
  }

  return pinned.map((item) => `## ${item.label}\n${item.content}`).join("\n\n");
}
