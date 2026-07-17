import type { PinnedArtifact } from "../types.js";

/** 会话里最多钉住几份材料；钉太多会挤占每轮必带的 Root set 预算。 */
const MAX_PINNED = 4;

/** 单份材料最多保留多少字；只留“够模型接着用”的摘录，不整文件塞进 prompt。 */
const MAX_PIN_CHARS = 1_200;

/**
 * 从一句话里找出“像文件路径”的片段。
 *
 * 用户说「看看 @src/foo.ts」或「改一下 src/foo.ts」时，路径会被识别出来，
 * 后续才能读内容并钉住。两种写法等价：带 `@` 的显式提及，或空白旁的裸路径。
 */
const PATH_MENTION =
  /@([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)|(?:^|\s)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=\s|$)/g;

/**
 * 用户提到某个文件时，自动把该文件（或其摘录）“钉”进会话上下文。
 *
 * ## 为什么要 pin？
 *
 * 对话一长，早期内容会被 Compaction 压缩或挤出 Working set，模型下一轮可能
 * 再也看不到用户点名的那个文件。Pinned artifact 属于 Root set：每轮都会重新
 * 注入 Assembled prompt，且不受普通历史轮转影响——相当于把关键材料别在桌上，
 * 避免“说过要看这个文件，过两轮却丢了”。
 *
 * ## 原理（做了什么）
 *
 * 1. 扫一遍用户输入，用路径模式找出提到的相对路径。
 * 2. 对每个尚未钉过的路径：尽量读出文件摘录；读不到就先钉一个占位说明。
 * 3. 追加到已有 pin 列表（不删旧的），按路径去重，并受条数/字数配额限制。
 *
 * 这是 Harness 的自动策略：用户不用显式说 “pin”，提路径即可能入钉。
 * 之后仍可由模型侧请求等方式继续 pin（本函数只管用户输入这一条路径）。
 *
 * @param userInput - 本轮有效用户输入（若刚 `/new` 换任务，这里应已去掉前缀）。
 * @param existing - 会话里已经钉住的材料；本函数在其上追加，不替换整表。
 * @param readExcerpt - 按相对路径取文件摘录；缺省或读失败时用占位文本顶上。
 * @returns 更新后的 pin 列表（总条数不超过 {@link MAX_PINNED}）。
 */
export function autoPinFromUserInput(
  userInput: string,
  existing: PinnedArtifact[],
  readExcerpt?: (relativePath: string) => string | null
): PinnedArtifact[] {
  const pinned = [...existing];
  const seen = new Set(pinned.map((item) => item.label));

  for (const match of userInput.matchAll(PATH_MENTION)) {
    const relativePath = (match[1] ?? match[2] ?? "").replace(/^\.\//, "");
    // 空匹配或已经钉过的路径：跳过，避免重复占配额
    if (!relativePath || seen.has(relativePath)) {
      continue;
    }

    // 有读函数就钉真实摘录；否则至少钉住路径名，提醒后续仍可再读
    const excerpt = readExcerpt?.(relativePath) ?? `(pinned path) ${relativePath}`;
    pinned.push({
      id: `pin-${pinned.length + 1}`,
      label: relativePath,
      content: truncate(excerpt, MAX_PIN_CHARS)
    });
    seen.add(relativePath);

    // 配额已满：不再扫后面的路径
    if (pinned.length >= MAX_PINNED) {
      break;
    }
  }

  return pinned.slice(0, MAX_PINNED);
}

/** 超长摘录裁到上限，末尾加 `...`，避免单条 pin 撑爆 prompt。 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
