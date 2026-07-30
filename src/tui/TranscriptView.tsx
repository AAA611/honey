import React from "react";
import { Box, Text } from "ink";
import type { ConversationMessage } from "../types.js";
import { ThinkingIndicator } from "./ThinkingIndicator.js";

export function TranscriptView(props: {
  messages: ConversationMessage[];
  notices: string[];
  /** Committed Reasoning entries (parallel Session state). */
  reasoning?: string[];
  /** Mid-Turn Reasoning preview (not yet committed). */
  reasoningDraft?: string;
  /** Mid-Turn Draft assistant preview (not yet in Transcript). */
  draftAssistant?: string;
  /** When true, show an animated thinking placeholder under the transcript. */
  thinking?: boolean;
}): React.ReactElement {
  const reasoningEntries = props.reasoning ?? [];
  const reasoningDraft = props.reasoningDraft ?? "";
  const draftAssistant = props.draftAssistant ?? "";
  const hasDraft =
    reasoningDraft.length > 0 || draftAssistant.length > 0;

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
      {props.messages.map((message, index) => (
        <Box key={`msg-${index}`} marginBottom={1} flexDirection="column">
          <Text color={roleColor(message.role)} bold>
            {message.role}
          </Text>
          <Text>{formatMessage(message)}</Text>
        </Box>
      ))}
      {reasoningEntries.map((entry, index) => (
        <Box key={`reasoning-${index}`} marginBottom={1} flexDirection="column">
          <Text color="gray" bold>
            reasoning
          </Text>
          <Text dimColor>{entry}</Text>
        </Box>
      ))}
      {reasoningDraft.length > 0 ? (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" bold>
            reasoning
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
      reasoningEntries.length === 0 ? (
        <Text dimColor>
          Transcript is empty. Type a prompt, or `/` for commands and Skills.
        </Text>
      ) : null}
    </Box>
  );
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
  if (message.role === "tool") {
    const preview =
      message.content.length > 400
        ? `${message.content.slice(0, 397)}...`
        : message.content;
    return `${message.toolName} ${message.ok ? "ok" : "ERR"}\n${preview}`;
  }
  if (message.role === "assistant") {
    const tools = message.toolCalls?.length
      ? `\n(tool_calls: ${message.toolCalls.map((call) => call.toolName).join(", ")})`
      : "";
    return `${message.content}${tools}`;
  }
  return message.content;
}
