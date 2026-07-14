export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4) + 1;
}

export function estimateMessageTokens(
  message: { role: string; content: string; toolName?: string }
): number {
  const toolTax = message.toolName ? estimateTokens(message.toolName) : 0;
  return estimateTokens(message.content) + toolTax + 4;
}
