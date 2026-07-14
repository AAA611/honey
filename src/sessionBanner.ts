export type SessionBannerOptions = {
  isTTY: boolean;
  columns?: number;
  noColor?: boolean;
};

const USAGE_LINE = "Type a prompt, or exit to quit.";
const AMBER = "\u001b[38;5;214m";
const RESET = "\u001b[0m";

// FIGlet "isometric3" — tall decorative wordmark for Session entry.
const WORDMARK = [
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
  "     \\__\\/         \\__\\/         \\__\\/         \\__\\/                "
].join("\n");

const WORDMARK_WIDTH = Math.max(
  ...WORDMARK.split("\n").map((line) => line.length)
);

export function formatSessionBanner(options: SessionBannerOptions): string {
  if (!options.isTTY) {
    return "";
  }

  const columns = options.columns ?? WORDMARK_WIDTH;
  let wordmark = columns < WORDMARK_WIDTH ? "HONEY" : WORDMARK;

  if (!options.noColor) {
    wordmark = `${AMBER}${wordmark}${RESET}`;
  }

  return `${wordmark}\n${USAGE_LINE}\n`;
}
