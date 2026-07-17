import { describe, expect, it } from "vitest";
import {
  isIncompleteKittyCsiU,
  isKittyCsiUInput,
  isKittyEncodedEscape,
  isSlashDismissKey,
  pushKittyCsiFragment
} from "./keys.js";

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

  it("does not treat plain letters as dismiss", () => {
    expect(isSlashDismissKey("c", { escape: false, ctrl: false })).toBe(false);
    expect(isSlashDismissKey("/", { escape: false, ctrl: false })).toBe(false);
  });
});
