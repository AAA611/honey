/**
 * Ink useInput replacement for the Composer.
 *
 * Rewrites Kitty CSI-u to legacy keys before parseKeypress so bare Enter
 * (`\x1b[13u`) does not crash Ink (ctrl=true + input=undefined → startsWith).
 * Also treats LF as Enter and reassembles split CSI-u reads.
 */
import { useEffect, useRef } from "react";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { useStdin } from "ink";
import type { Key } from "ink";
import { rewriteKittyCsiUChunk } from "./keys.js";

const require = createRequire(import.meta.url);
const inkBuildDir = dirname(require.resolve("ink"));
const parseKeypressModule = require(
  join(inkBuildDir, "parse-keypress.js")
) as {
  default: (input: string) => {
    name?: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    option?: boolean;
    sequence: string;
  };
  nonAlphanumericKeys: string[];
};
const parseKeypress = parseKeypressModule.default;
const { nonAlphanumericKeys } = parseKeypressModule;

export type ComposerInputHandler = (input: string, key: Key) => void;

const INCOMPLETE_CSI_FLUSH_MS = 40;

function toStringChunk(data: string | Buffer): string {
  return typeof data === "string" ? data : data.toString("utf8");
}

/** Split rewritten text so control keys are parsed as their own events. */
export function splitComposerKeyAtoms(rewritten: string): string[] {
  const events: string[] = [];
  let i = 0;
  while (i < rewritten.length) {
    const ch = rewritten[i]!;
    if (
      ch === "\r" ||
      ch === "\n" ||
      ch === "\t" ||
      ch === "\x7f" ||
      ch === "\b"
    ) {
      // LF → CR so parseKeypress yields name=return (Ink ignores name=enter).
      events.push(ch === "\n" ? "\r" : ch);
      i += 1;
      continue;
    }
    if (ch === "\u001b") {
      // Keep CSI/SS3 sequences intact (`\x1b[D` left arrow must not become Esc + `[D`).
      const rest = rewritten.slice(i);
      const sequence =
        /^\u001b\[[\d;?]*[ -/]*[@-~]/.exec(rest)?.[0] ??
        /^\u001bO[A-Za-z]/.exec(rest)?.[0] ??
        /^\u001b\[\d+(?:;[\d:]*)?u/.exec(rest)?.[0];
      if (sequence) {
        events.push(sequence);
        i += sequence.length;
      } else if (rest.startsWith("\u001b[")) {
        // Incomplete CSI (`\x1b[`, `\x1b[27`, or `\x1b[` before another Esc) —
        // treat as Esc; never type the dangling `[`.
        const incomplete = /^\u001b\[[\d;:?]*/.exec(rest);
        events.push("\u001b");
        i += incomplete ? incomplete[0].length : 2;
      } else {
        events.push("\u001b");
        i += 1;
      }
      continue;
    }
    let j = i + 1;
    while (j < rewritten.length) {
      const next = rewritten[j]!;
      if (
        next === "\r" ||
        next === "\n" ||
        next === "\t" ||
        next === "\u001b" ||
        next === "\x7f" ||
        next === "\b"
      ) {
        break;
      }
      j += 1;
    }
    events.push(rewritten.slice(i, j));
    i = j;
  }
  return events;
}

function emitParsed(
  atom: string,
  inputHandler: ComposerInputHandler,
  exitOnCtrlC: boolean
): void {
  const keypress = parseKeypress(atom);
  const key: Key = {
    upArrow: keypress.name === "up",
    downArrow: keypress.name === "down",
    leftArrow: keypress.name === "left",
    rightArrow: keypress.name === "right",
    pageDown: keypress.name === "pagedown",
    pageUp: keypress.name === "pageup",
    home: keypress.name === "home",
    end: keypress.name === "end",
    return: keypress.name === "return" || keypress.name === "enter",
    escape: keypress.name === "escape",
    ctrl: Boolean(keypress.ctrl),
    shift: Boolean(keypress.shift),
    tab: keypress.name === "tab",
    backspace: keypress.name === "backspace",
    delete: keypress.name === "delete",
    meta: Boolean(
      keypress.meta || keypress.name === "escape" || keypress.option
    ),
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false
  };

  let input: string = keypress.ctrl ? String(keypress.name ?? "") : keypress.sequence;
  if (keypress.name && nonAlphanumericKeys.includes(keypress.name)) {
    input = "";
  }
  if (keypress.name === "return" || keypress.name === "enter") {
    input = "";
    key.return = true;
  }
  // Mac/terminal Backspace sends DEL (\x7f); Ink labels it "delete". Treat as
  // backward-delete. True forward-delete remains CSI 3~ (`\x1b[3~`).
  if (atom === "\x7f") {
    input = "";
    key.backspace = true;
    key.delete = false;
  }
  if (typeof input === "string" && input.startsWith("\u001b")) {
    input = input.slice(1);
  }
  if (typeof input !== "string") {
    input = "";
  }

  if (!(input === "c" && key.ctrl) || !exitOnCtrlC) {
    inputHandler(input, key);
  }
}

export function useComposerInput(
  inputHandler: ComposerInputHandler,
  options: { isActive?: boolean } = {}
): void {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin();
  const pendingRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(inputHandler);
  handlerRef.current = inputHandler;

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (options.isActive === false) {
      return;
    }
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);

  useEffect(() => {
    if (options.isActive === false) {
      return;
    }

    const flushPendingAsEsc = (): void => {
      if (pendingRef.current.length === 0) {
        return;
      }
      // Split Esc with no follow-up (`\x1b[` timeout) → treat as Esc.
      pendingRef.current = "";
      emitParsed("\u001b", (input, key) => handlerRef.current(input, key), false);
    };

    const handleData = (data: string | Buffer): void => {
      clearTimer();
      const combined = `${pendingRef.current}${toStringChunk(data)}`;
      const { rewritten, rest } = rewriteKittyCsiUChunk(combined);
      pendingRef.current = rest;

      for (const atom of splitComposerKeyAtoms(rewritten)) {
        emitParsed(atom, (input, key) => handlerRef.current(input, key), internal_exitOnCtrlC);
      }

      if (rest.length > 0) {
        timerRef.current = setTimeout(() => {
          if (pendingRef.current === rest) {
            flushPendingAsEsc();
          }
        }, INCOMPLETE_CSI_FLUSH_MS);
      }
    };

    internal_eventEmitter?.on("input", handleData);
    return () => {
      clearTimer();
      pendingRef.current = "";
      internal_eventEmitter?.removeListener("input", handleData);
    };
  }, [options.isActive, internal_exitOnCtrlC, internal_eventEmitter]);
}
