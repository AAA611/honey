/**
 * Pure key helpers for Composer / slash overlay.
 * Kept free of React so Esc-dismiss can be unit-tested without a TTY.
 */

export type ComposerKeyFlags = {
  escape: boolean;
  ctrl: boolean;
  meta?: boolean;
  return?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
};

/**
 * Kitty keyboard protocol CSI-u payload after Ink strips the leading ESC.
 * Forms include `[27u`, `[27;1u`, `[27;1:3u` (modifiers + event type).
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
const KITTY_CSI_U = /^\[(\d+)(?:;([\d:]*))?u$/;

/** Full CSI-u including leading ESC (raw stdin chunk). */
const KITTY_CSI_U_RAW = /\u001b\[(\d+)(?:;[\d:]*)?u/g;

/** Trailing incomplete CSI-u prefix in a raw chunk (`\x1b`, `\x1b[`, `\x1b[27;1`). */
const KITTY_CSI_U_RAW_INCOMPLETE =
  /\u001b(?:\[\d*(?:;[\d:]*)?)?$/;

export type KittyCsiUAction =
  | "escape"
  | "return"
  | "tab"
  | "backspace"
  | "ignore";

export function parseKittyCsiU(
  input: string
): { codepoint: number; params: string } | null {
  const match = KITTY_CSI_U.exec(input);
  if (!match) {
    return null;
  }
  return { codepoint: Number(match[1]), params: match[2] ?? "" };
}

/** Map a Kitty functional codepoint to a Composer action. */
export function kittyCodepointAction(codepoint: number): KittyCsiUAction {
  switch (codepoint) {
    case 27:
      return "escape";
    case 13:
      return "return";
    case 9:
      return "tab";
    case 127:
      return "backspace";
    default:
      return "ignore";
  }
}

/**
 * Decode a CSI-u payload (with or without leading ESC) into an action.
 * Returns null when the string is not CSI-u.
 */
export function decodeKittyCsiUAction(input: string): KittyCsiUAction | null {
  const trimmed = input.startsWith("\u001b") ? input.slice(1) : input;
  const parsed = parseKittyCsiU(trimmed);
  if (!parsed) {
    return null;
  }
  return kittyCodepointAction(parsed.codepoint);
}

function legacyKeyForCodepoint(codepoint: number): string {
  switch (kittyCodepointAction(codepoint)) {
    case "escape":
      return "\u001b";
    case "return":
      return "\r";
    case "tab":
      return "\t";
    case "backspace":
      return "\x7f";
    case "ignore":
      return "";
  }
}

/**
 * Rewrite complete Kitty CSI-u sequences in a raw stdin chunk to legacy keys
 * so Ink's parseKeypress does not mis-read them (bare `[13u` sets ctrl=true and
 * leaves input undefined, which crashes useInput on `input.startsWith`).
 */
export function rewriteKittyCsiUChunk(chunk: string): {
  rewritten: string;
  rest: string;
} {
  let rest = "";
  let body = chunk;
  const incomplete = KITTY_CSI_U_RAW_INCOMPLETE.exec(chunk);
  if (incomplete && incomplete.index !== undefined) {
    // Hold trailing incomplete prefixes, including bare Esc.
    // Cursor often delivers Esc as `\x1b` then `[` on the next readable; if we
    // emit Esc immediately, `[` types into `/` → `/[` and the slash panel looks
    // like Esc failed.
    rest = incomplete[0];
    body = chunk.slice(0, incomplete.index);
  }

  let rewritten = body.replace(KITTY_CSI_U_RAW, (_match, code: string) =>
    legacyKeyForCodepoint(Number(code))
  );

  // If rewrite left an incomplete CSI *with bracket* in the body
  // (e.g. `\x1b[\x1b[`), hold it instead of emitting Esc + printable `[`.
  // Do not re-hold a bare Esc produced by rewriting `\x1b[27u`.
  const bodyIncomplete = KITTY_CSI_U_RAW_INCOMPLETE.exec(rewritten);
  if (bodyIncomplete && bodyIncomplete.index !== undefined) {
    const hold = bodyIncomplete[0];
    if (hold.startsWith("\u001b[")) {
      rest = `${hold}${rest}`;
      rewritten = rewritten.slice(0, bodyIncomplete.index);
    }
  }

  return { rewritten, rest };
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

/** Keys that dismiss the slash overlay (Esc, Ctrl+[, Ctrl+G; Ctrl+C handled by caller). */
export function isSlashDismissKey(
  input: string,
  key: ComposerKeyFlags
): boolean {
  return (
    key.escape ||
    input === "\u001b" ||
    input === "\x1b" ||
    isKittyEncodedEscape(input) ||
    (key.ctrl && (input === "[" || input === "g" || input === "G"))
  );
}
