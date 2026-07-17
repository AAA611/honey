import type { ContextLayers, ConversationMessage, PinnedArtifact } from "../types.js";

export function createContextLayers(input: {
  system: string;
  task?: string;
  projectInstructions?: string;
  environment?: string;
  skillCatalog?: string;
  skillInstructions?: string;
  pinned?: PinnedArtifact[];
}): ContextLayers {
  return {
    system: input.system,
    projectInstructions: input.projectInstructions ?? "",
    task: input.task ?? "",
    environment: input.environment ?? "",
    skillCatalog: input.skillCatalog ?? "",
    skillInstructions: input.skillInstructions ?? "",
    workingSet: [],
    summary: [],
    pinned: input.pinned ?? [],
    compaction: {
      clearedTools: false,
      summarized: false
    }
  };
}

export function appendWorkingMessages(
  layers: ContextLayers,
  messages: ConversationMessage[]
): ContextLayers {
  return {
    ...layers,
    workingSet: [...layers.workingSet, ...messages]
  };
}
