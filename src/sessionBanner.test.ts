import { describe, expect, it } from "vitest";
import { formatSessionBanner } from "./sessionBanner.js";

describe("Session banner seam", () => {
  it("returns empty output when stdout is not a TTY", () => {
    expect(
      formatSessionBanner({
        isTTY: false,
        columns: 80,
        noColor: false
      })
    ).toBe("");
  });

  it("degrades to a single-line wordmark on a narrow TTY", () => {
    expect(
      formatSessionBanner({
        isTTY: true,
        columns: 20,
        noColor: true
      })
    ).toBe("HONEY\nType a prompt, or exit to quit.\n");
  });

  it("prints the tall decorative wordmark on a wide TTY", () => {
    expect(
      formatSessionBanner({
        isTTY: true,
        columns: 80,
        noColor: true
      })
    ).toBe(
      [
        "      ___           ___           ___           ___                 ",
        "     /__/\\         /  /\\         /__/\\         /  /\\          ___   ",
        "     \\  \\:\\       /  /::\\        \\  \\:\\       /  /:/_        /__/|  ",
        "      \\__\\:\\     /  /:/\\:\\        \\  \\:\\     /  /:/ /\\      |  |:|  ",
        "  ___ /  /::\\   /  /:/  \\:\\   _____\\__\\:\\   /  /:/ /:/_     |  |:|  ",
        " /__/\\  /:/\\:\\ /__/:/ \\__\\:\\ /__/::::::::\\ /__/:/ /:/ /\\  __|__|:|  ",
        " \\  \\:\\/:/__\\/ \\  \\:\\ /  /:/ \\  \\:\\~~\\~~\\/ \\  \\:\\/:/ /:/ /__/::::\\  ",
        "  \\  \\::/       \\  \\:\\  /:/   \\  \\:\\  ~~~   \\  \\::/ /:/     ~\\~~\\:\\ ",
        "   \\  \\:\\        \\  \\:\\/:/     \\  \\:\\        \\  \\:\\/:/        \\  \\:\\",
        "    \\  \\:\\        \\  \\::/       \\  \\:\\        \\  \\::/          \\__\\/",
        "     \\__\\/         \\__\\/         \\__\\/         \\__\\/                ",
        "Type a prompt, or exit to quit.",
        ""
      ].join("\n")
    );
  });

  it("colors only the wordmark on a TTY when color is enabled", () => {
    const output = formatSessionBanner({
      isTTY: true,
      columns: 80,
      noColor: false
    });

    expect(output.startsWith("\u001b[38;5;214m")).toBe(true);
    expect(output).toContain("\u001b[0m\nType a prompt, or exit to quit.\n");
    expect(output).not.toMatch(/\u001b\[38;5;214mType a prompt/);
  });
});
