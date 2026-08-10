/**
 * Composer caret geometry for Ink `useCursor` (CJK IME).
 *
 * Prefer measuring the *content row* node (inside border/padding). Adding a
 * hardcoded `y + 1` for the outer bordered box lands on the bottom border and
 * looks like a vertical caret offset.
 */
import stringWidth from "string-width";
import type { DOMElement } from "ink";

export const COMPOSER_PROMPT = "honey› ";

/** Columns from the content-row origin to the caret (prompt + text before). */
export function composerCursorColumn(input: {
  before: string;
  prompt?: string;
}): number {
  const prompt = input.prompt ?? COMPOSER_PROMPT;
  return stringWidth(prompt) + stringWidth(input.before);
}

/** Walk Yoga parents to get the node origin in Ink output coordinates. */
export function getInkNodeOrigin(
  node: DOMElement | undefined
): { x: number; y: number } | null {
  if (!node?.yogaNode) {
    return null;
  }
  let x = 0;
  let y = 0;
  let current: DOMElement | undefined = node;
  while (current) {
    const yoga = current.yogaNode;
    if (yoga) {
      x += yoga.getComputedLeft();
      y += yoga.getComputedTop();
    }
    current = current.parentNode;
  }
  return { x, y };
}

/**
 * Absolute caret position for `useCursor`, or null when layout is not ready.
 * `caretRowNode` must be the inner content row (not the bordered outer box).
 */
export function composerImeCursorPosition(input: {
  caretRowNode: DOMElement | undefined;
  before: string;
}): { x: number; y: number } | null {
  const origin = getInkNodeOrigin(input.caretRowNode);
  if (!origin) {
    return null;
  }
  return {
    x: origin.x + composerCursorColumn({ before: input.before }),
    y: origin.y
  };
}
