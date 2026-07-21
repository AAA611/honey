import React from "react";
import { Box, Text } from "ink";
import { useSpinnerFrame } from "./ThinkingIndicator.js";

export function StatusBar(props: {
  cwd: string;
  busy: boolean;
  skillCount: number;
  messageCount: number;
}): React.ReactElement {
  const spinner = useSpinnerFrame(props.busy);
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text dimColor>
        honey tui · skills {props.skillCount} · messages {props.messageCount}
        {props.busy ? ` · ${spinner} running…` : ""}
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
