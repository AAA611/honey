import type { Plan } from "../types.js";

/**
 * 用户新说一句话时，相对「当前任务」该怎么处理。
 *
 * - `continue`：还是刚才那个目标，这句话是补充/跟进。
 * - `replace`：换了新目标；旧 Task/Plan 作废，按新输入重建。
 */
export type TaskTransition = "continue" | "replace";

/**
 * 判断：这句话是接着干，还是另起炉灶。
 *
 * ## 为什么要显式判定？
 *
 * REPL 里用户会连续打多轮。若一律当成同一 Task，不相关的新目标会被悄悄
 * 叠进旧验收标准；若一律新建 Task，又会把「然后顺便……」误切成新任务。
 * 所以 Harness 在 `runTurn` 入口先问一句：continue 还是 replace？——任务边界
 * 是运行时决策，不是聊天记录自然长出来的。
 *
 * ## 原理（按优先级，命中即停）
 *
 * 1. **用户点名换任务**：以 `/new` 开头 → 一定 `replace`（后续用
 *    {@link stripTaskSwitchPrefix} 剥掉前缀，只留下真正目标）。
 * 2. **还没有任务骨架**：没有 `currentTask` 或没有 `plan` → `replace`
 *    （第一次说话，必须先立 Task/Plan）。
 * 3. **语气像续写**：also / then / and / plus / next / continue / follow up
 *    等开头 → `continue`（明确在跟进，即使内容有点发散也不切）。
 * 4. **旧活干完且话风像新目标**：Plan 步骤全是 `done`，且新输入与当前 Task
 *    词汇重叠很低（见 {@link looksLikeNewGoal}）→ `replace`。
 * 5. **其余默认续写**：拿不准就 `continue`，宁可多跟一轮，也不轻易丢上下文。
 *
 * @param input.userInput - 本轮原始输入（可以带 `/new`）。
 * @param input.currentTask - 已生效的 Task 文案；空串表示还没有。
 * @param input.plan - 当前 Plan；`null` 表示还没建过。
 * @returns `"continue"` 保留 Task/Plan；`"replace"` 换新目标并重建 Plan。
 */
export function decideTaskTransition(input: {
  userInput: string;
  currentTask: string;
  plan: Plan | null;
}): TaskTransition {
  const trimmed = input.userInput.trim();

  // 用户显式说「换任务」
  if (/^\/new\b/i.test(trimmed)) {
    return "replace";
  }

  // 还没有可续写的 Task/Plan，只能新建
  if (!input.currentTask || !input.plan) {
    return "replace";
  }

  // 续写口吻优先：先信用户在跟进，再考虑「像新目标」的启发式
  if (hasContinuationCue(trimmed)) {
    return "continue";
  }

  // 旧计划已收工，且这句话和旧目标几乎不沾边 → 当作新任务
  const planDone = input.plan.steps.every((step) => step.status === "done");
  if (planDone && looksLikeNewGoal(trimmed, input.currentTask)) {
    return "replace";
  }

  // 拿不准就继续当前任务
  return "continue";
}

/**
 * 去掉 `/new` 命令前缀，留下后面的目标正文。
 *
 * `/new fix the login bug` → `fix the login bug`
 */
export function stripTaskSwitchPrefix(userInput: string): string {
  return userInput.replace(/^\/new\s+/i, "").trim();
}

/** 句子是否像「接着说」：以常见英文续写词开头。 */
function hasContinuationCue(userInput: string): boolean {
  return /^(also|then|and|plus|next|continue|follow\s*up)\b/i.test(userInput);
}

/**
 * 粗判：这句话像不像一个全新的目标（而不是旧任务的补充）。
 *
 * 原理很简单——把两边都拆成词，看重叠比例：
 * - 太短（不足 24 字）不敢判，当作不像新目标（避免短回复误切）。
 * - 重叠率低于 20%：和新 Task 几乎不共用关键词，更像另起话题。
 *
 * 只在「Plan 已全部完成」时参与决策，避免任务做到一半被误换。
 */
function looksLikeNewGoal(userInput: string, currentTask: string): boolean {
  if (userInput.length < 24) {
    return false;
  }

  const currentTokens = new Set(tokenize(currentTask));
  const nextTokens = tokenize(userInput);
  if (nextTokens.length === 0) {
    return false;
  }

  const overlap = nextTokens.filter((token) => currentTokens.has(token)).length;
  const ratio = overlap / nextTokens.length;
  return ratio < 0.2;
}

/** 抽长度超过 2 的小写词，用来做上面的粗粒度「像不像同一话题」比较。 */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
}
