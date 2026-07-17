import React from "react";
import { Box, Text } from "ink";
import type { SlashItem } from "./slashItems.js";

export function SlashOverlay(props: {
  items: SlashItem[];
  selectedIndex: number;
  query: string;
}): React.ReactElement {
  const visible = props.items.slice(0, 12);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Text color="cyan" bold>
        /{props.query || "…"} — ↑↓ · Enter/Tab · Esc/Ctrl+G/Ctrl+C dismiss
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>No matches</Text>
      ) : (
        visible.map((item, index) => {
          const selected = index === props.selectedIndex;
          return (
            <Text key={item.id} color={selected ? "black" : undefined} backgroundColor={selected ? "cyan" : undefined}>
              {selected ? "› " : "  "}
              {item.label}
              <Text dimColor={!selected}> — {truncate(item.description, 64)}</Text>
            </Text>
          );
        })
      )}
      {props.items.length > visible.length ? (
        <Text dimColor>…{props.items.length - visible.length} more</Text>
      ) : null}
    </Box>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}
