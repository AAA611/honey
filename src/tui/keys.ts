/**
 * Pure key helpers for Composer / slash overlay.
 * Kept free of React so Esc-dismiss can be unit-tested without a TTY.
 */

export type ComposerKeyFlags = {
  escape: boolean;
  ctrl: boolean;
  meta?: boolean;
};

/**
 * Kitty keyboard protocol encodes Esc as CSI u (`\x1b[27u` / `\x1b[27;1u`).
 * Ink strips the leading ESC and passes input like `[27u` with escape=false.
 * Cursor/VS Code integrated terminals often enable this protocol.
 */
export function isKittyEncodedEscape(input: string): boolean {
  return /^\[27(;\d+)?u$/.test(input);
}

/** Keys that dismiss the slash overlay (Esc, Ctrl+G; Ctrl+C handled by caller). */
export function isSlashDismissKey(
  input: string,
  key: ComposerKeyFlags
): boolean {
  return (
    key.escape ||
    input === "\u001b" ||
    input === "\x1b" ||
    isKittyEncodedEscape(input) ||
    (key.ctrl && (input === "g" || input === "G"))
  );
}
