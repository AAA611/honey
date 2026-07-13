import type { ContextLayers, ConversationMessage } from "../types.js";

const MAX_WORKING_SET = 8;

export function createContextLayers(
  systemPrompt: string,
  goal: string
): ContextLayers {
  return {
    system: systemPrompt,
    task: goal,
    workingSet: [],
    summary: []
  };
}

export function appendWorkingMessages(
  layers: ContextLayers,
  messages: ConversationMessage[]
): ContextLayers {
  const workingSet = [...layers.workingSet, ...messages];
  if (workingSet.length <= MAX_WORKING_SET) {
    return { ...layers, workingSet };
  }

  const overflow = workingSet.slice(0, workingSet.length - MAX_WORKING_SET);
  const trimmed = workingSet.slice(-MAX_WORKING_SET);
  const summaryLine = overflow
    .map((message) => `${message.role}: ${truncate(message.content, 120)}`)
    .join(" | ");

  return {
    ...layers,
    workingSet: trimmed,
    summary: [...layers.summary, summaryLine]
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
