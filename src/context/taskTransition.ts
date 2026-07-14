import type { Plan } from "../types.js";

export type TaskTransition = "continue" | "replace";

export function decideTaskTransition(input: {
  userInput: string;
  currentTask: string;
  plan: Plan | null;
}): TaskTransition {
  const trimmed = input.userInput.trim();
  if (/^\/new\b/i.test(trimmed)) {
    return "replace";
  }

  if (!input.currentTask || !input.plan) {
    return "replace";
  }

  if (hasContinuationCue(trimmed)) {
    return "continue";
  }

  const planDone = input.plan.steps.every((step) => step.status === "done");
  if (planDone && looksLikeNewGoal(trimmed, input.currentTask)) {
    return "replace";
  }

  return "continue";
}

export function stripTaskSwitchPrefix(userInput: string): string {
  return userInput.replace(/^\/new\s+/i, "").trim();
}

function hasContinuationCue(userInput: string): boolean {
  return /^(also|then|and|plus|next|continue|follow\s*up)\b/i.test(userInput);
}

function looksLikeNewGoal(userInput: string, currentTask: string): boolean {
  if (userInput.length < 24) {
    return false;
  }

  const currentTokens = new Set(tokenize(currentTask));
  const nextTokens = tokenize(userInput);
  if (nextTokens.length === 0) {
    return false;
  }

  const overlap = nextTokens.filter((token) => currentTokens.has(token)).length;
  const ratio = overlap / nextTokens.length;
  return ratio < 0.2;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
}
