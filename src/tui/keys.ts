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
 * Kitty keyboard protocol CSI-u payload after Ink strips the leading ESC.
 * Forms include `[27u`, `[27;1u`, `[27;1:3u` (modifiers + event type).
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
const KITTY_CSI_U = /^\[(\d+)(?:;([\d:]*))?u$/;

export function parseKittyCsiU(
  input: string
): { codepoint: number; params: string } | null {
  const match = KITTY_CSI_U.exec(input);
  if (!match) {
    return null;
  }
  return { codepoint: Number(match[1]), params: match[2] ?? "" };
}

/** True for any Kitty CSI-u key Ink failed to decode (must not type into Composer). */
export function isKittyCsiUInput(input: string): boolean {
  return parseKittyCsiU(input) !== null;
}

/**
 * Kitty encodes Esc as codepoint 27.
 * Cursor/VS Code integrated terminals often enable this protocol.
 */
export function isKittyEncodedEscape(input: string): boolean {
  const parsed = parseKittyCsiU(input);
  return parsed !== null && parsed.codepoint === 27;
}

/** Incomplete CSI-u after a split read, e.g. `[` or `[27;1`. */
export function isIncompleteKittyCsiU(buffer: string): boolean {
  return /^\[\d*(?:;[\d:]*)?$/.test(buffer);
}

export type KittyCsiPushOptions = {
  /**
   * When true, a lone `[` starts a CSI buffer (split `\x1b[` reads).
   * When false, `[` is left for the caller to treat as printable.
   */
  bufferLoneBracket: boolean;
};

/**
 * Reassemble Kitty CSI-u across stdin chunks (`\x1b[` then `27u`).
 * Returns the next buffer and any completed CSI-u payload (without leading ESC).
 *
 * `flushed` is printable text to emit when an incomplete buffer is abandoned
 * (e.g. user typed `[` then `a` while buffering).
 */
export function pushKittyCsiFragment(
  buffer: string,
  input: string,
  options: KittyCsiPushOptions
): { buffer: string; completed: string | null; flushed: string } {
  if (buffer.length === 0) {
    if (isKittyCsiUInput(input)) {
      return { buffer: "", completed: input, flushed: "" };
    }
    if (isIncompleteKittyCsiU(input) && input.length > 1) {
      // `[27` etc. — clearly CSI, not a user bracket.
      return { buffer: input, completed: null, flushed: "" };
    }
    if (input === "[" && options.bufferLoneBracket) {
      return { buffer: "[", completed: null, flushed: "" };
    }
    return { buffer: "", completed: null, flushed: "" };
  }

  const next = `${buffer}${input}`;
  if (isKittyCsiUInput(next)) {
    return { buffer: "", completed: next, flushed: "" };
  }
  if (isIncompleteKittyCsiU(next) && next.length <= 64) {
    return { buffer: next, completed: null, flushed: "" };
  }
  // Invalid continuation — drop CSI garbage; do not type it into Composer.
  return { buffer: "", completed: null, flushed: "" };
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
