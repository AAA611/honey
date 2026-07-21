import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function useSpinnerFrame(active: boolean, intervalMs = 80): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return SPINNER_FRAMES[index] ?? SPINNER_FRAMES[0];
}

/** Animated placeholder shown in Transcript while the Turn is pending. */
export function ThinkingIndicator(): React.ReactElement {
  const frame = useSpinnerFrame(true);
  return (
    <Box marginBottom={1} flexDirection="column">
      <Text color="green" bold>
        assistant
      </Text>
      <Text dimColor>
        {frame} thinking…
      </Text>
    </Box>
  );
}
