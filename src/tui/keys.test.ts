import { describe, expect, it } from "vitest";
import {
  decodeKittyCsiUAction,
  isIncompleteKittyCsiU,
  isKittyCsiUInput,
  isKittyEncodedEscape,
  isSlashDismissKey,
  pushKittyCsiFragment,
  rewriteKittyCsiUChunk
} from "./keys.js";
import { splitComposerKeyAtoms } from "./useComposerInput.js";

describe("isKittyEncodedEscape", () => {
  it("matches CSI-u Esc forms Ink passes after stripping leading ESC", () => {
    expect(isKittyEncodedEscape("[27u")).toBe(true);
    expect(isKittyEncodedEscape("[27;1u")).toBe(true);
    expect(isKittyEncodedEscape("[27;5u")).toBe(true);
    expect(isKittyEncodedEscape("[27;1:3u")).toBe(true);
    expect(isKittyEncodedEscape("[27;1:1u")).toBe(true);
  });

  it("rejects other CSI-u keys and noise", () => {
    expect(isKittyEncodedEscape("[13u")).toBe(false); // Enter
    expect(isKittyEncodedEscape("[99;5u")).toBe(false); // Ctrl+C
    expect(isKittyEncodedEscape("27u")).toBe(false);
  });
});

describe("isKittyCsiUInput", () => {
  it("matches any CSI-u payload", () => {
    expect(isKittyCsiUInput("[13u")).toBe(true);
    expect(isKittyCsiUInput("[27;1:3u")).toBe(true);
  });
});

describe("pushKittyCsiFragment", () => {
  it("completes a split `[` + `27;1:3u` read", () => {
    const first = pushKittyCsiFragment("", "[", { bufferLoneBracket: true });
    expect(first).toEqual({ buffer: "[", completed: null, flushed: "" });
    const second = pushKittyCsiFragment(first.buffer, "27;1:3u", {
      bufferLoneBracket: true
    });
    expect(second).toEqual({
      buffer: "",
      completed: "[27;1:3u",
      flushed: ""
    });
  });

  it("does not buffer a lone `[` when bufferLoneBracket is false", () => {
    expect(
      pushKittyCsiFragment("", "[", { bufferLoneBracket: false })
    ).toEqual({ buffer: "", completed: null, flushed: "" });
  });

  it("returns complete CSI-u in one chunk", () => {
    expect(
      pushKittyCsiFragment("", "[27;1:3u", { bufferLoneBracket: true })
    ).toEqual({ buffer: "", completed: "[27;1:3u", flushed: "" });
  });

  it("drops invalid CSI continuations instead of flushing garbage", () => {
    const first = pushKittyCsiFragment("", "[", { bufferLoneBracket: true });
    const second = pushKittyCsiFragment(first.buffer, "xyz", {
      bufferLoneBracket: true
    });
    expect(second.completed).toBeNull();
    expect(second.buffer).toBe("");
    expect(isIncompleteKittyCsiU("[x")).toBe(false);
  });
});

describe("isSlashDismissKey", () => {
  it("treats Ink-parsed Escape as dismiss", () => {
    // Mirrors ink useInput: escape → key.escape=true, input=''
    expect(isSlashDismissKey("", { escape: true, ctrl: false, meta: true })).toBe(
      true
    );
  });

  it("treats raw ESC byte as dismiss", () => {
    expect(
      isSlashDismissKey("\u001b", { escape: false, ctrl: false })
    ).toBe(true);
  });

  it("treats Kitty-encoded Esc (including event-type) as dismiss", () => {
    expect(
      isSlashDismissKey("[27u", { escape: false, ctrl: false, meta: true })
    ).toBe(true);
    expect(
      isSlashDismissKey("[27;1u", { escape: false, ctrl: false })
    ).toBe(true);
    expect(
      isSlashDismissKey("[27;1:3u", { escape: false, ctrl: false })
    ).toBe(true);
  });

  it("treats Ctrl+G as dismiss", () => {
    expect(isSlashDismissKey("g", { escape: false, ctrl: true })).toBe(true);
  });

  it("treats Ctrl+[ as dismiss", () => {
    expect(isSlashDismissKey("[", { escape: false, ctrl: true })).toBe(true);
  });

  it("does not treat plain letters as dismiss", () => {
    expect(isSlashDismissKey("c", { escape: false, ctrl: false })).toBe(false);
    expect(isSlashDismissKey("/", { escape: false, ctrl: false })).toBe(false);
  });
});

describe("rewriteKittyCsiUChunk", () => {
  it("rewrites Esc/Enter/Tab/Backspace CSI-u to legacy keys", () => {
    expect(rewriteKittyCsiUChunk("\u001b[27u")).toEqual({
      rewritten: "\u001b",
      rest: ""
    });
    expect(rewriteKittyCsiUChunk("\u001b[13u")).toEqual({
      rewritten: "\r",
      rest: ""
    });
    expect(rewriteKittyCsiUChunk("\u001b[13;1:3u")).toEqual({
      rewritten: "\r",
      rest: ""
    });
    expect(rewriteKittyCsiUChunk("\u001b[9u")).toEqual({
      rewritten: "\t",
      rest: ""
    });
    expect(rewriteKittyCsiUChunk("\u001b[127u")).toEqual({
      rewritten: "\x7f",
      rest: ""
    });
  });

  it("holds back an incomplete trailing CSI prefix", () => {
    expect(rewriteKittyCsiUChunk("\u001b[")).toEqual({
      rewritten: "",
      rest: "\u001b["
    });
    expect(rewriteKittyCsiUChunk("\u001b[13")).toEqual({
      rewritten: "",
      rest: "\u001b[13"
    });
  });

  it("does not hold a bare Esc", () => {
    expect(rewriteKittyCsiUChunk("\u001b")).toEqual({
      rewritten: "\u001b",
      rest: ""
    });
  });
});

describe("decodeKittyCsiUAction", () => {
  it("maps functional codepoints", () => {
    expect(decodeKittyCsiUAction("[13u")).toBe("return");
    expect(decodeKittyCsiUAction("[27;1:3u")).toBe("escape");
    expect(decodeKittyCsiUAction("\u001b[9u")).toBe("tab");
    expect(decodeKittyCsiUAction("abc")).toBeNull();
  });
});

describe("splitComposerKeyAtoms", () => {
  it("splits printable runs from control keys and maps LF to CR", () => {
    expect(splitComposerKeyAtoms("ab\nc")).toEqual(["ab", "\r", "c"]);
    expect(splitComposerKeyAtoms("\r")).toEqual(["\r"]);
  });

  it("keeps CSI arrow sequences intact", () => {
    expect(splitComposerKeyAtoms("\u001b[D")).toEqual(["\u001b[D"]);
    expect(splitComposerKeyAtoms("ab\u001b[C")).toEqual(["ab", "\u001b[C"]);
    expect(splitComposerKeyAtoms("\u001b")).toEqual(["\u001b"]);
  });
});
