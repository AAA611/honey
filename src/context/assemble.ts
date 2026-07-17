import type {
  AssemblySnapshot,
  ContextLayers,
  ConversationMessage,
  Plan
} from "../types.js";
import { estimateMessageTokens, estimateTokens } from "./tokens.js";

/**
 * 把分层上下文拼成发给 Provider 的「系统侧」整段文本（Assembled prompt 的 Root 部分）。
 *
 * ## 为什么要 assemble，而不是直接丢 Transcript？
 *
 * Provider 只该看到 Harness 精心排好的 Assembled prompt，而不是会话里的原始
 * 聊天记录。Transcript 留给持久化/回放；真正进模型的，是按稳定顺序叠起来的
 * 若干层——这样每轮注入什么、什么抗 Compaction，都由运行时说了算。
 *
 * ## 原理（拼什么、什么顺序）
 *
 * 只拼 **Root set**（每轮必带、Compaction 后仍在的层），按固定顺序拼接：
 *
 * 1. System — 运行时基座人格/规则
 * 2. Project instructions — 仓库指导（如 AGENTS.md / CONTEXT.md）
 * 3. Task — 当前用户目标与验收口径
 * 4. Plan — 步骤进度（状态列表，不是验收替代品）
 * 5. Environment — cwd、平台等会话环境事实
 * 6. Summary — 被压出来的早期历史摘要
 * 7. Pinned artifacts — 用户点名钉住的材料
 *
 * Working set（近期对话与工具 I/O）**不**进这段字符串；由
 * {@link assembleProviderMessages} 单独作为消息列表附上。
 * 空层会跳过，避免输出一堆空白标题。
 *
 * @param layers - 当前上下文分层。
 * @param plan - 当前 Plan；`null` 时 Plan 段省略。
 * @returns 供 Provider 当 system（或等价）使用的拼接文本。
 */
export function assembleSystemPrompt(layers: ContextLayers, plan: Plan | null): string {
  const sections = [
    layers.system,
    section("Project instructions", layers.projectInstructions),
    section("Task", layers.task),
    section("Plan", formatPlan(plan)),
    section("Environment", layers.environment),
    section("Summary", layers.summary.join("\n")),
    section("Pinned artifacts", formatPinned(layers.pinned))
  ];

  return sections.filter(Boolean).join("\n\n");
}

/**
 * 取出 Assembled prompt 的「对话侧」消息列表，准备交给 Provider。
 *
 * ## 为什么要和 system 分开组装？
 *
 * 发给模型的载荷有两块：
 * - {@link assembleSystemPrompt}：Root set 拼成的系统文本（Task、Plan、Pinned…）
 * - 本函数：Working set —— 最近的 user / assistant / tool 往来
 *
 * Root 每轮稳定重注；Working set 会随对话增长，也会被 Compaction 裁短或压进
 * Summary。两边职责不同，所以不混进同一段字符串，而是 system 一段、messages
 * 一组，对应常见 Provider API 的拆法。
 *
 * ## 原理
 *
 * 当前实现很薄：对 `layers.workingSet` 做浅拷贝后返回。不读 Transcript，也不
 * 在这里做过滤/重排——「哪些消息还留在 Working set」已由 append / compact 决定；
 * 本函数只负责「原样端给 Provider」。
 *
 * @param layers - 当前上下文分层（只用其中的 workingSet）。
 * @returns 可直接作为 Provider messages 的消息数组（新数组，元素为浅拷贝）。
 */
export function assembleProviderMessages(
  layers: ContextLayers
): ConversationMessage[] {
  return layers.workingSet.map((message) => ({ ...message }));
}

/**
 * 用本地启发式估算整份 Assembled prompt 的 token 数
 *（system 拼接文本 + Working set 各条消息），供 Compaction 判断是否超预算。
 */
export function estimateAssembledTokens(
  layers: ContextLayers,
  plan: Plan | null
): number {
  const systemTokens = estimateTokens(assembleSystemPrompt(layers, plan));
  const messageTokens = layers.workingSet.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0
  );
  return systemTokens + messageTokens;
}

/**
 * 在真正发给模型之前，给当前 Assembled prompt「拍一张结构快照」。
 *
 * ## 为什么要 snapshot，而不是只靠 prompt dump？
 *
 * dump 是整份原文（可选、体积大）；snapshot 是 **Context inventory 的结构化版本**：
 * 记录「这一轮拼进了哪些层、大概多少 token、有没有做过 Compaction」，方便会话内
 * 回看和事后排查。它**不送 Provider**，只进 Session 的 `assemblySnapshots` 列表。
 *
 * ## 原理（记什么、故意不记什么）
 *
 * - **记**：Root 层全文或拷贝（system / project / task / environment / summary /
 *   pinned）、Plan 的 goal 与步骤状态、token 估计、compaction 标记、时间戳。
 * - **Working set 只记骨架**：条数 + 每条 role，不复制对话/工具正文——正文已在
 *   Transcript / 可选 prompt dump 里；快照要轻，回答的是「结构长什么样」，
 *   不是「每句话写了啥」。
 *
 * 典型调用点：Harness 在 `assembleSystemPrompt` / `assembleProviderMessages`
 * 之后、发 `model_request` 之前，每 Turn 推入一帧。
 *
 * @param layers - 即将（或刚）用于组装的上下文分层。
 * @param plan - 当前 Plan；无 Plan 时 goal/steps 记为 null / []。
 * @returns 可持久化、可对比的 AssemblySnapshot（浅拷贝，不共享可变引用）。
 */
export function createAssemblySnapshot(
  layers: ContextLayers,
  plan: Plan | null
): AssemblySnapshot {
  return {
    timestamp: new Date().toISOString(),
    tokenEstimate: estimateAssembledTokens(layers, plan),
    compaction: { ...layers.compaction },
    layers: {
      system: layers.system,
      projectInstructions: layers.projectInstructions,
      task: layers.task,
      environment: layers.environment,
      summary: [...layers.summary],
      // Working set：只留结构指纹，不拷正文
      workingSetCount: layers.workingSet.length,
      workingSetRoles: layers.workingSet.map((message) => message.role),
      pinned: layers.pinned.map((item) => ({ ...item })),
      planGoal: plan?.goal ?? null,
      planSteps:
        plan?.steps.map((step) => ({ id: step.id, status: step.status })) ?? []
    }
  };
}

/** 有内容才输出「标题 + 正文」；空内容返回空串，便于上层 filter 掉。 */
function section(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "";
  }
  return `${title}:\n${trimmed}`;
}

/** 把 Plan 编成 checklist 文本；无 Plan 则空。 */
function formatPlan(plan: Plan | null): string {
  if (!plan) {
    return "";
  }

  return plan.steps
    .map((step) => `- [${step.status}] ${step.id}: ${step.title}`)
    .join("\n");
}

/** 把 Pinned artifact 编成可读块；无 pin 则空。 */
function formatPinned(
  pinned: ContextLayers["pinned"]
): string {
  if (pinned.length === 0) {
    return "";
  }

  return pinned.map((item) => `## ${item.label}\n${item.content}`).join("\n\n");
}
