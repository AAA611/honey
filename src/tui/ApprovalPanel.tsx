import React from "react";
import { Box, Text } from "ink";
import type { ApprovalView } from "../runtime/approval.js";

export function ApprovalPanel(props: {
  view: ApprovalView;
}): React.ReactElement {
  const { view } = props;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      width="100%"
    >
      <Text color="yellow" bold>
        Approval
      </Text>
      <Text>{view.headline}</Text>
      {view.details.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {view.details.map((line, index) => (
            <Text key={`${index}:${line.slice(0, 24)}`} color={detailColor(line)}>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{view.hint}</Text>
      </Box>
    </Box>
  );
}

function detailColor(line: string): string | undefined {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("−")) {
    return "red";
  }
  if (trimmed.startsWith("+")) {
    return "green";
  }
  return undefined;
}
