import React from "react";
import { Box, Text, useStdout } from "ink";
import { getSessionBannerContent } from "../sessionBanner.js";

/** Session banner wordmark rendered above the Status bar in the Session TUI. */
export function SessionBannerView(): React.ReactElement {
  const { stdout } = useStdout();
  const { wordmarkLines, usageLine } = getSessionBannerContent({
    columns: stdout.columns
  });

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      {wordmarkLines.map((line, index) => (
        <Text key={index} color="#ffaf00">
          {line}
        </Text>
      ))}
      <Text dimColor>{usageLine}</Text>
    </Box>
  );
}
