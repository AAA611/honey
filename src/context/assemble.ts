import type {
  AssemblySnapshot,
  ContextLayers,
  ConversationMessage,
  Plan
} from "../types.js";
import { estimateMessageTokens, estimateTokens } from "./tokens.js";

export function assembleSystemPrompt(layers: ContextLayers, plan: Plan | null): string {
  const sections = [
    layers.system,
    section("Project instructions", layers.projectInstructions),
    section("Task", layers.task),
    section("Plan", formatPlan(plan)),
    section("Environment", layers.environment),
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
  plan: Plan | null
): number {
  const systemTokens = estimateTokens(assembleSystemPrompt(layers, plan));
  const messageTokens = layers.workingSet.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0
  );
  return systemTokens + messageTokens;
}

export function createAssemblySnapshot(
  layers: ContextLayers,
  plan: Plan | null
): AssemblySnapshot {
  return {
    timestamp: new Date().toISOString(),
    tokenEstimate: estimateAssembledTokens(layers, plan),
    compaction: { ...layers.compaction },
    layers: {
      system: layers.system,
      projectInstructions: layers.projectInstructions,
      task: layers.task,
      environment: layers.environment,
      summary: [...layers.summary],
      workingSetCount: layers.workingSet.length,
      workingSetRoles: layers.workingSet.map((message) => message.role),
      pinned: layers.pinned.map((item) => ({ ...item })),
      planGoal: plan?.goal ?? null,
      planSteps:
        plan?.steps.map((step) => ({ id: step.id, status: step.status })) ?? []
    }
  };
}

function section(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "";
  }
  return `${title}:\n${trimmed}`;
}

function formatPlan(plan: Plan | null): string {
  if (!plan) {
    return "";
  }

  return plan.steps
    .map((step) => `- [${step.status}] ${step.id}: ${step.title}`)
    .join("\n");
}

function formatPinned(
  pinned: ContextLayers["pinned"]
): string {
  if (pinned.length === 0) {
    return "";
  }

  return pinned.map((item) => `## ${item.label}\n${item.content}`).join("\n\n");
}
