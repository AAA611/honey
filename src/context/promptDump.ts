import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConversationMessage } from "../types.js";

export interface PromptDumpInput {
  directory: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  systemPrompt: string;
  messages: ConversationMessage[];
  tokenEstimate: number;
}

export function dumpAssembledPrompt(input: PromptDumpInput): string {
  mkdirSync(input.directory, { recursive: true });
  const filename = `${stamp()}-${String(input.sequence).padStart(3, "0")}-${input.turnId.slice(0, 8)}.md`;
  const path = join(input.directory, filename);
  writeFileSync(path, formatDump(input), "utf8");
  return path;
}

export function defaultDumpPromptsDir(cwd: string): string {
  return join(cwd, ".honey", "prompt-dumps");
}

function formatDump(input: PromptDumpInput): string {
  const messageBlocks = input.messages
    .map((message, index) => {
      const header =
        message.role === "tool"
          ? `### [${index}] tool:${message.toolName} callId=${message.callId} ok=${message.ok}`
          : `### [${index}] ${message.role}`;
      return `${header}\n\n${message.content}`;
    })
    .join("\n\n");

  return [
    "# Assembled prompt",
    "",
    `- sessionId: ${input.sessionId}`,
    `- turnId: ${input.turnId}`,
    `- sequence: ${input.sequence}`,
    `- tokenEstimate: ${input.tokenEstimate}`,
    `- messageCount: ${input.messages.length}`,
    "",
    "## systemPrompt",
    "",
    input.systemPrompt,
    "",
    "## messages",
    "",
    messageBlocks || "(empty)",
    ""
  ].join("\n");
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
