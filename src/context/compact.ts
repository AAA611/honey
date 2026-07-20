import type {
  ContextLayers,
  ConversationMessage,
  Plan,
  SummaryWriter
} from "../types.js";
import { estimateAssembledTokens } from "./assemble.js";

/** 工具结果超过这个长度才考虑清空/裁短；短结果留着划不来。 */
const MAX_TOOL_RESULT_CHARS = 800;

/**
 * 「可再读」的内置工具：结果丢掉也没关系，模型需要时可以再调一次。
 * Connector Tools mark `definition.refetchable` and are merged in by callers.
 */
export const BUILTIN_REFETCHABLE_TOOLS = new Set([
  "read_file",
  "search_workspace",
  "run_tests"
]);

/**
 * 默认的 Summary 写法：不调模型，把被挤出的消息压成一行短摘要。
 * 以后可以换成「再开一轮模型写 Summary」，接口仍是同一个 SummaryWriter。
 */
export const deterministicSummaryWriter: SummaryWriter = {
  write(messages: ConversationMessage[]): string {
    return messages
      .map((message) => {
        if (message.role === "tool") {
          return `tool:${message.toolName}:${message.ok ? "ok" : "err"}:${truncate(message.content, 80)}`;
        }
        return `${message.role}:${truncate(message.content, 80)}`;
      })
      .join(" | ");
  }
};

/**
 * 组装 prompt 前的「减压阀」：超预算才动手，否则原样返回。
 *
 * ## 为什么要 compact？
 *
 * Assembled prompt 有 token 上限。对话和工具结果越积越多，迟早塞不下。
 * Compaction 由 Harness 管，不把整段聊天原样扔给 Provider，也不靠简单截断：
 * 先腾可再取的大块，再把更早的历史压进 Summary（Summary 在 Root set 里，
 * 每轮还会带上；Working set 只留最近几条）。
 *
 * ## 原理（两级，能停就停）
 *
 * 1. **估 token**：用本地启发式估整份 Assembled prompt；≤ 预算 → 什么都不做。
 * 2. **清/缩工具结果**：对可再读工具（读文件、搜仓库、跑测试）的大结果做
 *    清空占位；其它工具结果则裁短。再估一次；够了就返回。
 * 3. **仍超预算 → 摘要溢出**：从 Working set 头部切出更早的消息，写成 Summary
 *    追加进去，直到落回预算（或没法再安全切分）。必要时再把残留的大工具
 *    结果压到更短。
 *
 * Root set（Task、Plan、Pinned、已有 Summary 等）不会被这一步删掉；
 * 动的主要是 Working set 里的大块和「变成 Summary 的旧对话」。
 *
 * @param layers - 当前上下文分层（会先浅拷贝再改，不原地突变入参）。
 * @param plan - 当前 Plan；估 token 时要算进 Assembled prompt。
 * @param tokenBudget - 本会话允许的 Assembled prompt 上限。
 * @param summaryWriter - 把挤出的消息写成 Summary 的策略；默认确定性短摘要。
 * @param refetchableTools - 可再读工具名；默认内置集合。
 * @returns 可能已减压的新 ContextLayers（含 compaction 状态标记）。
 */
export function compactIfNeeded(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number,
  summaryWriter: SummaryWriter = deterministicSummaryWriter,
  refetchableTools: ReadonlySet<string> = BUILTIN_REFETCHABLE_TOOLS
): ContextLayers {
  let next: ContextLayers = {
    ...layers,
    workingSet: layers.workingSet.map((message) => ({ ...message })),
    summary: [...layers.summary],
    pinned: layers.pinned.map((item) => ({ ...item })),
    compaction: { ...layers.compaction }
  };

  // 没超预算：减压没必要
  if (estimateAssembledTokens(next, plan) <= tokenBudget) {
    return next;
  }

  // 第一刀：腾可再读的工具结果（丢了还能再调工具拿回来）
  next = clearRefetchableToolResults(next, refetchableTools);
  next.compaction = { ...next.compaction, clearedTools: true };

  if (estimateAssembledTokens(next, plan) <= tokenBudget) {
    return next;
  }

  // 第二刀：仍超 → 把 Working set 头部压进 Summary
  return summarizeOverflow(next, plan, tokenBudget, summaryWriter);
}

/**
 * 在 Working set 里给工具结果「瘦身」。
 *
 * - 可再读工具 + 内容很长：换成简短占位，提示模型需要时再读。
 * - 其它工具：不能假设能重跑，只截断到 {@link MAX_TOOL_RESULT_CHARS}。
 */
function clearRefetchableToolResults(
  layers: ContextLayers,
  refetchableTools: ReadonlySet<string>
): ContextLayers {
  const workingSet = layers.workingSet.map((message) => {
    if (message.role !== "tool") {
      return message;
    }
    if (!refetchableTools.has(message.toolName)) {
      return shrinkToolContent(message);
    }
    if (message.content.length <= MAX_TOOL_RESULT_CHARS) {
      return message;
    }
    return {
      ...message,
      content: `[cleared refetchable ${message.toolName} result; re-read if needed] ${truncate(message.content, 120)}`
    };
  });

  return { ...layers, workingSet };
}

/** 不可再读的工具结果：只做硬截断，保留前缀信息。 */
function shrinkToolContent(message: ConversationMessage): ConversationMessage {
  if (message.role !== "tool") {
    return message;
  }
  if (message.content.length <= MAX_TOOL_RESULT_CHARS) {
    return message;
  }
  return {
    ...message,
    content: truncate(message.content, MAX_TOOL_RESULT_CHARS)
  };
}

/**
 * 把 Working set 里更早的对话「搬走」写成 Summary，直到估 token 落回预算。
 *
 * 切分要成对安全：留下的 Working set 不能以孤立的 tool 结果开头
 *（否则模型看到结果却看不到对应的调用）。实在切不动时，再把残留的大
 * tool 内容压到更短作为最后手段。
 */
function summarizeOverflow(
  layers: ContextLayers,
  plan: Plan | null,
  tokenBudget: number,
  summaryWriter: SummaryWriter
): ContextLayers {
  let workingSet = [...layers.workingSet];
  const summary = [...layers.summary];

  while (
    workingSet.length > 2 &&
    estimateAssembledTokens({ ...layers, workingSet, summary }, plan) > tokenBudget
  ) {
    const splitAt = findPairSafeSplit(workingSet);
    if (splitAt <= 0) {
      break;
    }
    const overflow = workingSet.slice(0, splitAt);
    workingSet = workingSet.slice(splitAt);
    summary.push(summaryWriter.write(overflow));
  }

  // 对话已尽量收束仍超预算：再砍残留的大工具输出
  while (
    estimateAssembledTokens({ ...layers, workingSet, summary }, plan) >
      tokenBudget &&
    workingSet.some(
      (message) => message.role === "tool" && message.content.length > 160
    )
  ) {
    workingSet = workingSet.map((message) => {
      if (message.role !== "tool" || message.content.length <= 160) {
        return message;
      }
      return { ...message, content: truncate(message.content, 160) };
    });
  }

  return {
    ...layers,
    workingSet,
    summary,
    compaction: {
      clearedTools: true,
      summarized: true
    }
  };
}

/**
 * 找一个安全的切点：切走前面一段后，剩下的 Working set 以 user/assistant 开头，
 * 绝不以孤立的 tool 结果开头（tool 必须跟在产生它的那轮对话后面）。
 */
function findPairSafeSplit(workingSet: ConversationMessage[]): number {
  if (workingSet.length <= 2) {
    return 0;
  }

  const maxSplit = workingSet.length - 2;
  for (let index = maxSplit; index >= 1; index -= 1) {
    if (workingSet[index]?.role === "tool") {
      continue;
    }
    return index;
  }

  return 0;
}

/** 超长文本裁到上限，末尾加 `...`。 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
