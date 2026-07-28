import type { StepChecklist } from "../types.js";

/**
 * 用户新说一句话时，相对「当前任务」该怎么处理。
 *
 * - `continue`：还是刚才那个目标，这句话是补充/跟进。
 * - `replace`：换了新目标；旧 Task/Step checklist 作废，按新输入重建。
 */
export type TaskTransition = "continue" | "replace";

/**
 * 判断：这句话是接着干，还是另起炉灶。
 */
export function decideTaskTransition(input: {
  userInput: string;
  currentTask: string;
  stepChecklist: StepChecklist | null;
  /** @deprecated Use stepChecklist */
  plan?: StepChecklist | null;
}): TaskTransition {
  const checklist = input.stepChecklist ?? input.plan ?? null;
  const trimmed = input.userInput.trim();

  if (/^\/new\b/i.test(trimmed)) {
    return "replace";
  }

  if (!input.currentTask || !checklist) {
    return "replace";
  }

  if (hasContinuationCue(trimmed)) {
    return "continue";
  }

  const checklistDone = checklist.steps.every((step) => step.status === "done");
  if (checklistDone && looksLikeNewGoal(trimmed, input.currentTask)) {
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
