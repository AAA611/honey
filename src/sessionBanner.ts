export type SessionBannerOptions = {
  isTTY: boolean;
  columns?: number;
  noColor?: boolean;
};

const USAGE_LINE =
  "Type a prompt, `/` for Skills/commands (TUI), or exit to quit.";
const AMBER = "\u001b[38;5;214m";
const RESET = "\u001b[0m";

// FIGlet "isometric3" — tall decorative wordmark for Session entry.
const WORDMARK_LINES = [
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
];

const WORDMARK = WORDMARK_LINES.join("\n");

const WORDMARK_WIDTH = Math.max(...WORDMARK_LINES.map((line) => line.length));

export function getSessionBannerContent(options: {
  columns?: number;
}): { wordmarkLines: string[]; usageLine: string; compact: boolean } {
  const columns = options.columns ?? WORDMARK_WIDTH;
  const compact = columns < WORDMARK_WIDTH;
  return {
    wordmarkLines: compact ? ["HONEY"] : [...WORDMARK_LINES],
    usageLine: USAGE_LINE,
    compact
  };
}

export function formatSessionBanner(options: SessionBannerOptions): string {
  if (!options.isTTY) {
    return "";
  }

  const { wordmarkLines, usageLine } = getSessionBannerContent({
    columns: options.columns
  });
  let wordmark = wordmarkLines.join("\n");

  if (!options.noColor) {
    wordmark = `${AMBER}${wordmark}${RESET}`;
  }

  return `${wordmark}\n${usageLine}\n`;
}
