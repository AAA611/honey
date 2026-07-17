import { describe, expect, it } from "vitest";
import { isKittyEncodedEscape, isSlashDismissKey } from "./keys.js";

describe("isKittyEncodedEscape", () => {
  it("matches CSI-u Esc forms Ink passes after stripping leading ESC", () => {
    expect(isKittyEncodedEscape("[27u")).toBe(true);
    expect(isKittyEncodedEscape("[27;1u")).toBe(true);
    expect(isKittyEncodedEscape("[27;5u")).toBe(true);
  });

  it("rejects other CSI-u keys and noise", () => {
    expect(isKittyEncodedEscape("[13u")).toBe(false); // Enter
    expect(isKittyEncodedEscape("[99;5u")).toBe(false); // Ctrl+C
    expect(isKittyEncodedEscape("27u")).toBe(false);
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

  it("treats Kitty-encoded Esc as dismiss", () => {
    expect(isSlashDismissKey("[27u", { escape: false, ctrl: false, meta: true })).toBe(
      true
    );
    expect(
      isSlashDismissKey("[27;1u", { escape: false, ctrl: false })
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
