import {
  assembleProviderMessages,
  assembleSystemPrompt,
  createAssemblySnapshot,
  type AssemblePromptOptions
} from "../context/assemble.js";
import { compactIfNeeded } from "../context/compact.js";
import { appendWorkingMessages } from "../context/layers.js";
import type { EventLogger } from "../logging/eventLogger.js";
import { markStepChecklistStep } from "../planning/plan.js";
import type {
  AssemblySnapshot,
  ConversationMessage,
  ContextLayers,
  HarnessState,
  Provider,
  ProviderStreamDelta,
  StepChecklist,
  ToolCall,
  ToolDefinition,
  ToolExecutionResult
} from "../types.js";
import { UPDATE_PLAN_TOOL_NAME } from "./planMode.js";

export interface TurnLoopScope {
  logger: EventLogger;
  turnId: string;
  maxTurns: number;
  tokenBudget: number;
  provider: Provider;
  tools: ToolDefinition[];
  refetchableToolNames: Set<string>;
  /** Mutable Assembled-prompt layers (Working set lives here). */
  context: ContextLayers;
  /** Mutable Step checklist. */
  stepChecklist: StepChecklist;
  /** Live Plan Mode posture (may be read each Provider Turn). */
  getPlanMode: () => boolean;
  /** Live Plan document (updated mid-Run via update_plan). */
  getPlanDocument: () => string | null;
  /** When set, assistant/tool messages are appended in place (parent Transcript). */
  transcript?: ConversationMessage[];
  executeTool: (toolCall: ToolCall) => Promise<ToolExecutionResult>;
  /** Mid-Turn Draft assistant / Reasoning preview (Session TUI). */
  onStreamDelta?: (delta: ProviderStreamDelta) => void;
  /** Commit final Reasoning into parallel Session state (not Working set). */
  onReasoningCommitted?: (reasoning: string) => void;
  /** After each Provider model call finishes (before tool dispatch / DONE). */
  onModelCallComplete?: () => void;
  recordAssemblySnapshot?: (snapshot: AssemblySnapshot) => void;
  dumpAssembledPrompt?: (args: {
    systemPrompt: string;
    messages: ConversationMessage[];
    tokenEstimate: number;
  }) => string | null;
  /** Merged into model_request after common fields; read from current layers. */
  modelRequestExtras?: (context: ContextLayers) => Record<string, unknown>;
}

export interface TurnLoopResult {
  finalState: HarnessState;
  output: string;
}

/**
 * Shared Turn machine for a parent Run or nested Subagent Run.
 * Caller owns pre-loop setup (Task, user message, Subagent events) and post-loop wrapping.
 */
export async function runTurnLoop(scope: TurnLoopScope): Promise<TurnLoopResult> {
  const { logger, turnId } = scope;
  let state: HarnessState = "USER_INPUT";
  let output = "";

  for (let turn = 0; turn < scope.maxTurns; turn += 1) {
    state = transition(logger, turnId, state, "MODEL_TURN");
    scope.context = compactContext(scope);
    const assembleOpts = assembleOptions(scope);
    const assembledSystem = assembleSystemPrompt(scope.context, assembleOpts);
    const assembledMessages = assembleProviderMessages(scope.context);
    const assemblySnapshot = createAssemblySnapshot(scope.context, assembleOpts);
    scope.recordAssemblySnapshot?.(assemblySnapshot);

    let promptDumpPath: string | null = null;
    if (scope.dumpAssembledPrompt) {
      promptDumpPath = scope.dumpAssembledPrompt({
        systemPrompt: assembledSystem,
        messages: assembledMessages,
        tokenEstimate: assemblySnapshot.tokenEstimate
      });
    }

    logger.emit(
      "model_request",
      {
        assembled: true,
        task: scope.context.task,
        workingSetCount: scope.context.workingSet.length,
        tokenEstimate: assemblySnapshot.tokenEstimate,
        promptDumpPath,
        ...scope.modelRequestExtras?.(scope.context)
      },
      turnId
    );

    let response;
    try {
      const request = {
        systemPrompt: assembledSystem,
        messages: assembledMessages,
        tools: scope.tools
      };
      if (scope.provider.streamTurn) {
        response = await scope.provider.streamTurn(request, (delta) => {
          scope.onStreamDelta?.(delta);
        });
      } else {
        response = await scope.provider.sendTurn(request);
      }
    } catch (error: unknown) {
      state = transition(logger, turnId, state, "ERROR");
      output =
        error instanceof Error ? error.message : `Provider error: ${String(error)}`;
      logger.emit("error", { output }, turnId);
      break;
    }

    logger.emit(
      "model_response",
      {
        stopReason: response.stopReason,
        toolCalls: response.toolCalls,
        assistantMessage: response.assistantMessage?.content,
        reasoning: response.reasoning,
        usage: response.usage
      },
      turnId
    );

    if (response.assistantMessage) {
      appendMessages(scope, [response.assistantMessage]);
      // One slot per assistant message so the TUI can interleave Reasoning above it.
      scope.onReasoningCommitted?.(response.reasoning ?? "");
    }

    scope.onModelCallComplete?.();

    if (response.stopReason === "completed" && response.assistantMessage) {
      state = transition(logger, turnId, state, "DONE");
      scope.stepChecklist = markChecklistComplete(
        scope.stepChecklist,
        scope.getPlanMode()
      );
      logger.emit(
        "step_checklist_updated",
        { stepChecklist: scope.stepChecklist },
        turnId
      );
      output = response.assistantMessage.content;
      logger.emit("turn_finished", { output }, turnId);
      break;
    }

    if (response.stopReason !== "tool_calls") {
      state = transition(logger, turnId, state, "ERROR");
      output = "Provider returned an unsupported stop reason.";
      logger.emit("error", { output }, turnId);
      break;
    }

    scope.stepChecklist = markChecklistToolsInProgress(
      scope.stepChecklist,
      scope.getPlanMode(),
      response.toolCalls
    );
    logger.emit(
      "step_checklist_updated",
      { stepChecklist: scope.stepChecklist },
      turnId
    );
    state = transition(logger, turnId, state, "TOOL_DISPATCH");

    const toolMessages: ConversationMessage[] = [];
    for (const toolCall of response.toolCalls) {
      logger.emit("tool_call", { toolCall }, turnId);
      const toolResult = await scope.executeTool(toolCall);
      logger.emit("tool_result", { toolCall, toolResult }, turnId);
      toolMessages.push({
        role: "tool",
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        content: toolResult.content,
        ok: toolResult.ok
      });
    }

    appendMessages(scope, toolMessages);
    scope.context = compactContext(scope);
    state = transition(logger, turnId, state, "TOOL_RESULT");
  }

  if (state !== "DONE" && state !== "ERROR") {
    state = transition(logger, turnId, state, "ERROR");
    output = "Run stopped after reaching the max turn limit.";
    logger.emit("error", { output }, turnId);
  }

  return { finalState: state, output };
}

function appendMessages(
  scope: TurnLoopScope,
  messages: ConversationMessage[]
): void {
  scope.context = appendWorkingMessages(scope.context, messages);
  if (scope.transcript) {
    scope.transcript.push(...messages);
  }
}

function assembleOptions(scope: TurnLoopScope): AssemblePromptOptions {
  return {
    stepChecklist: scope.stepChecklist,
    planDocument: scope.getPlanDocument(),
    planMode: scope.getPlanMode()
  };
}

function compactContext(scope: TurnLoopScope): ContextLayers {
  return compactIfNeeded(
    scope.context,
    scope.stepChecklist,
    scope.tokenBudget,
    undefined,
    scope.refetchableToolNames,
    assembleOptions(scope)
  );
}

function markChecklistComplete(
  checklist: StepChecklist,
  planMode: boolean
): StepChecklist {
  if (planMode) {
    let next = markStepChecklistStep(checklist, "clarify-goal", "done");
    next = markStepChecklistStep(next, "explore-readonly", "done");
    const writeStatus = checklist.steps.find(
      (step) => step.id === "write-plan"
    )?.status;
    if (writeStatus === "in_progress" || writeStatus === "done") {
      next = markStepChecklistStep(next, "write-plan", "done");
    }
    return next;
  }
  let next = markStepChecklistStep(checklist, "understand-request", "done");
  next = markStepChecklistStep(next, "use-tools", "done");
  next = markStepChecklistStep(next, "report", "done");
  return next;
}

function markChecklistToolsInProgress(
  checklist: StepChecklist,
  planMode: boolean,
  toolCalls: ToolCall[]
): StepChecklist {
  if (planMode) {
    let next = markStepChecklistStep(checklist, "clarify-goal", "done");
    const wrotePlan = toolCalls.some(
      (call) => call.toolName === UPDATE_PLAN_TOOL_NAME
    );
    if (wrotePlan) {
      next = markStepChecklistStep(next, "explore-readonly", "done");
      next = markStepChecklistStep(next, "write-plan", "in_progress");
    } else {
      next = markStepChecklistStep(next, "explore-readonly", "in_progress");
    }
    return next;
  }
  let next = markStepChecklistStep(checklist, "understand-request", "done");
  next = markStepChecklistStep(next, "use-tools", "in_progress");
  return next;
}

function transition(
  logger: EventLogger,
  turnId: string,
  from: HarnessState,
  to: HarnessState
): HarnessState {
  logger.emit("state_transition", { from, to }, turnId);
  return to;
}
