import type { ToolCall, ToolDefinition } from "../types.js";
import {
  isPlanModeToolAllowed,
  UPDATE_PLAN_TOOL_NAME
} from "./planMode.js";
import { checkToolCallWorkspaceBound } from "./workspaceBound.js";

/**
 * 策略层在调度（dispatch）阶段给出的具名裁决结果（见 ADR-0015）。
 *
 * 这些结果只描述「工具调用能否越过策略关卡」；用户在审批仪式中明确拒绝
 * （approval deny）不在此联合类型内，由 Harness 另行处理。
 *
 * - `unknown_tool`：调用指向未注册 / 找不到定义的工具
 * - `plan_denied`：当前 Session 姿态（如 Plan Mode）不允许该工具
 * - `blocked`：工具风险等级为 blocked，一律拒绝
 * - `bound_reject`：路径越出工作区边界
 * - `needs_approval`：需由 Harness 发起审批，策略本身不执行审批
 * - `allow`：策略放行，可继续执行
 */
export type PolicyDispatchOutcome =
  | { kind: "unknown_tool" }
  | {
      kind: "plan_denied";
      reason: "not_in_allowlist" | "update_plan_outside_plan_mode";
    }
  | { kind: "blocked" }
  | { kind: "bound_reject"; reason: string; attemptedPath: string }
  | { kind: "needs_approval" }
  | { kind: "allow" };

/** Offer 阶段入参：是否处于 Plan Mode，用于过滤可暴露给模型的工具列表。 */
export type PolicyOfferInput = {
  planMode: boolean;
};

/**
 * Dispatch 阶段入参：对单次工具调用做完整策略裁决所需的上下文。
 *
 * - `toolDefinition`：已解析的工具定义；为 `null` 时直接判为 `unknown_tool`
 * - `toolCall`：模型发起的具体调用（含名称与参数）
 * - `planMode`：当前 Session 是否处于 Plan Mode
 * - `allowGuardedTools`：是否已获准跳过 guarded 工具的审批（例如用户已批准）
 * - `workspaceBoundEnabled`：是否启用工作区路径边界检查
 * - `cwd`：工作区根路径，供边界检查解析相对路径
 */
export type PolicyAuthorizeInput = {
  toolDefinition: ToolDefinition | null;
  toolCall: ToolCall;
  planMode: boolean;
  allowGuardedTools: boolean;
  workspaceBoundEnabled: boolean;
  cwd: string;
};

/**
 * 判断给定工具名在当前 Session 姿态下是否允许出现 / 执行。
 *
 * Offer（组装 prompt）与 Dispatch（授权调用）共用同一条姿态规则，避免两处策略漂移：
 * - Plan Mode 开启：仅允许 `isPlanModeToolAllowed` 白名单内的工具
 * - 非 Plan Mode：禁止 `update_plan`（该工具仅服务于规划态）
 *
 * @param toolName - 工具注册名
 * @param planMode - 当前是否处于 Plan Mode
 * @returns `true` 表示该工具名在当前姿态下可暴露或继续调度；否则应被过滤 / 拒绝
 */
export function isToolAllowedByPosture(
  toolName: string,
  planMode: boolean
): boolean {
  if (planMode) {
    return isPlanModeToolAllowed(toolName);
  }
  return toolName !== UPDATE_PLAN_TOOL_NAME;
}

/**
 * Offer 阶段策略：从全部工具定义中筛出可写入 Assembled prompt 的子集。
 *
 * 在把工具 schema 交给模型之前调用，确保模型只能「看见」当前姿态允许的工具，
 * 从而减少越权调用的发生面。过滤规则委托给 {@link isToolAllowedByPosture}。
 *
 * @param definitions - 会话可用的完整工具定义列表
 * @param input - Offer 上下文（当前是否 Plan Mode）
 * @returns 允许出现在 prompt 中的工具定义；顺序与输入中通过过滤的项一致
 */
export function toolsForPrompt(
  definitions: ToolDefinition[],
  input: PolicyOfferInput
): ToolDefinition[] {
  return definitions.filter((definition) =>
    isToolAllowedByPosture(definition.name, input.planMode)
  );
}

/**
 * Dispatch 阶段策略：裁决一次工具调用是否可通过权威检查并继续执行。
 *
 * 按固定顺序依次检查（任一失败即短路返回对应 outcome）：
 * 1. 工具定义是否存在 → `unknown_tool`
 * 2. 当前姿态是否允许该工具名 → `plan_denied`（区分白名单外 / 非规划态调 update_plan）
 * 3. 风险等级是否为 `blocked` → `blocked`
 * 4. （可选）工作区路径边界 → `bound_reject`
 * 5. 风险为 `guarded` 且尚未放行 → `needs_approval`（不在此执行审批仪式）
 * 6. 全部通过 → `allow`
 *
 * 本函数只做策略裁决，不发起审批 UI / 仪式；`needs_approval` 由 Harness 接手询问用户。
 *
 * @param input - 单次调用的授权上下文，见 {@link PolicyAuthorizeInput}
 * @returns 具名调度裁决，见 {@link PolicyDispatchOutcome}
 */
export async function authorizeToolCall(
  input: PolicyAuthorizeInput
): Promise<PolicyDispatchOutcome> {
  const { toolDefinition, toolCall } = input;

  if (!toolDefinition) {
    return { kind: "unknown_tool" };
  }

  if (!isToolAllowedByPosture(toolCall.toolName, input.planMode)) {
    if (!input.planMode && toolCall.toolName === UPDATE_PLAN_TOOL_NAME) {
      return { kind: "plan_denied", reason: "update_plan_outside_plan_mode" };
    }
    return { kind: "plan_denied", reason: "not_in_allowlist" };
  }

  if (toolDefinition.risk === "blocked") {
    return { kind: "blocked" };
  }

  if (input.workspaceBoundEnabled) {
    const bound = await checkToolCallWorkspaceBound({
      cwd: input.cwd,
      pathParams: toolDefinition.pathParams,
      arguments: toolCall.arguments
    });
    if (!bound.ok) {
      return {
        kind: "bound_reject",
        reason: bound.reason,
        attemptedPath: bound.attemptedPath
      };
    }
  }

  if (toolDefinition.risk === "guarded" && !input.allowGuardedTools) {
    return { kind: "needs_approval" };
  }

  return { kind: "allow" };
}
