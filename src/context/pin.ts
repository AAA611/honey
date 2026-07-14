import type { PinnedArtifact } from "../types.js";

const MAX_PINNED = 4;
const MAX_PIN_CHARS = 1_200;

const PATH_MENTION =
  /@([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)|(?:^|\s)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=\s|$)/g;

export function autoPinFromUserInput(
  userInput: string,
  existing: PinnedArtifact[],
  readExcerpt?: (relativePath: string) => string | null
): PinnedArtifact[] {
  const pinned = [...existing];
  const seen = new Set(pinned.map((item) => item.label));

  for (const match of userInput.matchAll(PATH_MENTION)) {
    const relativePath = (match[1] ?? match[2] ?? "").replace(/^\.\//, "");
    if (!relativePath || seen.has(relativePath)) {
      continue;
    }

    const excerpt = readExcerpt?.(relativePath) ?? `(pinned path) ${relativePath}`;
    pinned.push({
      id: `pin-${pinned.length + 1}`,
      label: relativePath,
      content: truncate(excerpt, MAX_PIN_CHARS)
    });
    seen.add(relativePath);

    if (pinned.length >= MAX_PINNED) {
      break;
    }
  }

  return pinned.slice(0, MAX_PINNED);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
