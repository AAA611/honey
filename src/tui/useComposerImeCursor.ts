import { useCursor, type DOMElement } from "ink";
import { composerImeCursorPosition } from "./composerImeCursor.js";

/**
 * Drive Ink's real terminal cursor onto the Composer caret each render.
 * Required for CJK IME candidate windows (Ink 6+ `useCursor`).
 */
export function useComposerImeCursor(input: {
  /** Inner content-row node (inside the bordered Composer box). */
  caretRowNode: DOMElement | undefined;
  before: string;
  /** When false, hide the terminal cursor (busy / Approval). */
  active: boolean;
}): void {
  const { setCursorPosition } = useCursor();

  if (!input.active) {
    setCursorPosition(undefined);
    return;
  }

  const position = composerImeCursorPosition({
    caretRowNode: input.caretRowNode,
    before: input.before
  });
  setCursorPosition(position ?? undefined);
}
