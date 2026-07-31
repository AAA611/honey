import React from "react";
import { Box, Text } from "ink";
import { useSpinnerFrame } from "./ThinkingIndicator.js";

export function StatusBar(props: {
  cwd: string;
  busy: boolean;
  awaitingApproval?: boolean;
  skillCount: number;
  messageCount: number;
}): React.ReactElement {
  const spinner = useSpinnerFrame(props.busy && !props.awaitingApproval);
  const activity = props.awaitingApproval
    ? " · awaiting approval"
    : props.busy
      ? ` · ${spinner} running…`
      : "";
  return (
    <Box
      borderStyle="single"
      borderColor={props.awaitingApproval ? "yellow" : "gray"}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text dimColor={!props.awaitingApproval} color={props.awaitingApproval ? "yellow" : undefined}>
        honey tui · skills {props.skillCount} · messages {props.messageCount}
        {activity}
      </Text>
      <Text dimColor>{truncate(props.cwd, 48)}</Text>
    </Box>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `…${value.slice(-(max - 1))}`;
}
