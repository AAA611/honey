/**
 * Feedback loop: Composer IME caret geometry for Ink useCursor.
 *
 * Command:
 *   npx vitest run src/tui/composerImeCursor.test.ts
 */
import { describe, expect, it } from "vitest";
import stringWidth from "string-width";
import {
  COMPOSER_PROMPT,
  composerCursorColumn,
  composerImeCursorPosition,
  getInkNodeOrigin
} from "../../tui/composerImeCursor.js";
import type { DOMElement } from "ink";

describe("composer IME cursor positioning", () => {
  it("columns are prompt + before (content-row relative, no border guess)", () => {
    expect(composerCursorColumn({ before: "" })).toBe(stringWidth(COMPOSER_PROMPT));
    expect(composerCursorColumn({ before: "ab" })).toBe(
      stringWidth(COMPOSER_PROMPT) + 2
    );
    expect(composerCursorColumn({ before: "你好" })).toBe(
      stringWidth(COMPOSER_PROMPT) + 4
    );
  });

  it("maps the content-row origin directly (no y+1 bottom-border bias)", () => {
    const parentYoga = {
      getComputedLeft: () => 0,
      getComputedTop: () => 10
    };
    const rowYoga = {
      getComputedLeft: () => 2,
      getComputedTop: () => 1
    };
    const parent = {
      nodeName: "ink-box",
      yogaNode: parentYoga,
      parentNode: undefined
    } as unknown as DOMElement;
    const row = {
      nodeName: "ink-box",
      yogaNode: rowYoga,
      parentNode: parent
    } as unknown as DOMElement;

    expect(getInkNodeOrigin(row)).toEqual({ x: 2, y: 11 });
    expect(
      composerImeCursorPosition({
        caretRowNode: row,
        before: "现在"
      })
    ).toEqual({
      x: 2 + composerCursorColumn({ before: "现在" }),
      // Must stay on the content row — y+1 was landing on the bottom border.
      y: 11
    });
  });
});
