import React from "react";
import { Box, Text } from "ink";
import type { ConversationMessage, ToolResultMessage } from "../types.js";
import { ThinkingIndicator } from "./ThinkingIndicator.js";

export type ReasoningExpandedMap = Record<number, boolean>;
export type ToolExpandedMap = Record<number, boolean>;

export function TranscriptView(props: {
  messages: ConversationMessage[];
  notices: string[];
  /** Committed Reasoning entries aligned 1:1 with assistant messages (empty = none). */
  reasoning?: string[];
  /** Which committed Reasoning slots are expanded (default collapsed). */
  reasoningExpanded?: ReasoningExpandedMap;
  /** Which tool-result messages are expanded (keyed by message index; default collapsed). */
  toolExpanded?: ToolExpandedMap;
  /** Mid-Turn Reasoning preview (not yet committed). */
  reasoningDraft?: string;
  /** Mid-Turn Draft assistant preview (not yet in Transcript). */
  draftAssistant?: string;
  /** When true, show an animated thinking placeholder under the transcript. */
  thinking?: boolean;
}): React.ReactElement {
  const reasoningEntries = props.reasoning ?? [];
  const reasoningExpanded = props.reasoningExpanded ?? {};
  const toolExpanded = props.toolExpanded ?? {};
  const reasoningDraft = props.reasoningDraft ?? "";
  const draftAssistant = props.draftAssistant ?? "";
  const hasDraft =
    reasoningDraft.length > 0 || draftAssistant.length > 0;

  const rows = buildTranscriptRows(props.messages, reasoningEntries);

  return (
    <Box flexDirection="column">
      {props.notices.map((notice, index) => (
        <Box key={`notice-${index}`} marginBottom={1} flexDirection="column">
          <Text color="yellow" dimColor>
            [notice]
          </Text>
          <Text>{notice}</Text>
        </Box>
      ))}
      {rows.map((row) => {
        if (row.kind === "reasoning") {
          return (
            <ReasoningBlock
              key={`reasoning-${row.reasoningIndex}`}
              text={row.text}
              expanded={Boolean(reasoningExpanded[row.reasoningIndex])}
            />
          );
        }
        if (row.message.role === "tool") {
          return (
            <ToolResultBlock
              key={`msg-${row.messageIndex}`}
              message={row.message}
              expanded={Boolean(toolExpanded[row.messageIndex])}
            />
          );
        }
        return (
          <Box
            key={`msg-${row.messageIndex}`}
            marginBottom={1}
            flexDirection="column"
          >
            <Text color={roleColor(row.message.role)} bold>
              {row.message.role}
            </Text>
            <Text>{formatMessage(row.message)}</Text>
          </Box>
        );
      })}
      {reasoningDraft.length > 0 ? (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" bold>
            ▾ reasoning
          </Text>
          <Text dimColor>{reasoningDraft}</Text>
        </Box>
      ) : null}
      {draftAssistant.length > 0 ? (
        <Box marginBottom={1} flexDirection="column">
          <Text color="green" bold>
            assistant
          </Text>
          <Text>{draftAssistant}</Text>
        </Box>
      ) : null}
      {props.thinking ? <ThinkingIndicator /> : null}
      {props.messages.length === 0 &&
      props.notices.length === 0 &&
      !props.thinking &&
      !hasDraft &&
      !rows.some((row) => row.kind === "reasoning") ? (
        <Text dimColor>
          Transcript is empty. Type a prompt, or `/` for commands and Skills.
        </Text>
      ) : null}
    </Box>
  );
}

function ReasoningBlock(props: {
  text: string;
  expanded: boolean;
}): React.ReactElement {
  const lines = props.text.split(/\r?\n/).filter((line) => line.length > 0);
  const lineLabel = `${Math.max(lines.length, 1)} line${lines.length === 1 ? "" : "s"}`;
  if (!props.expanded) {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color="gray" bold>
          ▸ reasoning
        </Text>
        <Text dimColor>
          {lineLabel} · r expand
        </Text>
      </Box>
    );
  }
  return (
    <Box marginBottom={1} flexDirection="column">
      <Text color="gray" bold>
        ▾ reasoning
      </Text>
      <Text dimColor>{props.text}</Text>
      <Text dimColor>r collapse</Text>
    </Box>
  );
}

function ToolResultBlock(props: {
  message: ToolResultMessage;
  expanded: boolean;
}): React.ReactElement {
  const status = props.message.ok ? "ok" : "ERR";
  if (!props.expanded) {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color="magenta" bold>
          ▸ {props.message.toolName}
        </Text>
        <Text dimColor>
          {status} · t expand
        </Text>
      </Box>
    );
  }
  const preview =
    props.message.content.length > 400
      ? `${props.message.content.slice(0, 397)}...`
      : props.message.content;
  return (
    <Box marginBottom={1} flexDirection="column">
      <Text color="magenta" bold>
        ▾ {props.message.toolName}
      </Text>
      <Text dimColor>{status}</Text>
      <Text>{preview}</Text>
      <Text dimColor>t collapse</Text>
    </Box>
  );
}

type TranscriptRow =
  | {
      kind: "message";
      messageIndex: number;
      message: ConversationMessage;
    }
  | {
      kind: "reasoning";
      reasoningIndex: number;
      text: string;
    };

/**
 * Interleave Reasoning above each paired assistant message.
 * `reasoning[i]` belongs to the i-th assistant message (empty string = none).
 */
export function buildTranscriptRows(
  messages: ConversationMessage[],
  reasoning: string[]
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let assistantOrdinal = 0;
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex]!;
    if (message.role === "assistant") {
      const text = reasoning[assistantOrdinal] ?? "";
      if (text.trim().length > 0) {
        rows.push({
          kind: "reasoning",
          reasoningIndex: assistantOrdinal,
          text
        });
      }
      assistantOrdinal += 1;
    }
    rows.push({ kind: "message", messageIndex, message });
  }
  return rows;
}

function roleColor(role: ConversationMessage["role"]): string {
  if (role === "user") {
    return "cyan";
  }
  if (role === "assistant") {
    return "green";
  }
  return "magenta";
}

function formatMessage(message: ConversationMessage): string {
  if (message.role === "assistant") {
    const tools = message.toolCalls?.length
      ? `\n(tool_calls: ${message.toolCalls.map((call) => call.toolName).join(", ")})`
      : "";
    return `${message.content}${tools}`;
  }
  return message.content;
}
