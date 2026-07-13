import { randomUUID } from "node:crypto";
import { appendWorkingMessages, createContextLayers } from "../context/layers.js";
import { EventLogger } from "../logging/eventLogger.js";
import { createInitialPlan, markPlanStep } from "../planning/plan.js";
import { ToolRegistry } from "../tools/registry.js";
import type {
  AssistantMessage,
  ConversationMessage,
  HarnessConfig,
  HarnessRunResult,
  HarnessState,
  Provider,
  Tool,
  ToolCall,
  ToolExecutionResult
} from "../types.js";

export class HarnessRuntime {
  constructor(
    private readonly provider: Provider,
    tools: Tool[],
    private readonly config: HarnessConfig
  ) {
    this.toolRegistry = new ToolRegistry(tools);
  }

  private readonly toolRegistry: ToolRegistry;

  async run(userInput: string): Promise<HarnessRunResult> {
    const logger = new EventLogger();
    const turnId = randomUUID();
    let state: HarnessState = "USER_INPUT";
    let output = "";
    let plan = createInitialPlan(userInput);
    let conversation: ConversationMessage[] = [{ role: "user", content: userInput }];
    let context = createContextLayers(this.config.systemPrompt, userInput);

    logger.emit("run_started", { provider: this.provider.name, input: userInput }, turnId);
    logger.emit("plan_updated", { plan }, turnId);

    for (let turn = 0; turn < this.config.maxTurns; turn += 1) {
      state = transition(logger, turnId, state, "MODEL_TURN");
      const requestMessages = [...conversation];
      context = appendWorkingMessages(context, requestMessages.slice(-1));
      logger.emit(
        "model_request",
        {
          system: context.system,
          task: context.task,
          summary: context.summary,
          workingSetCount: context.workingSet.length
        },
        turnId
      );

      const response = await this.provider.sendTurn({
        systemPrompt: context.system,
        messages: requestMessages,
        tools: this.toolRegistry.definitions()
      });

      logger.emit(
        "model_response",
        {
          stopReason: response.stopReason,
          toolCalls: response.toolCalls,
          assistantMessage: response.assistantMessage?.content,
          usage: response.usage
        },
        turnId
      );

      if (response.assistantMessage) {
        conversation = [...conversation, response.assistantMessage];
      }

      if (response.stopReason === "completed" && response.assistantMessage) {
        state = transition(logger, turnId, state, "DONE");
        plan = markPlanStep(plan, "understand-request", "done");
        plan = markPlanStep(plan, "report", "done");
        logger.emit("plan_updated", { plan }, turnId);
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

      plan = markPlanStep(plan, "understand-request", "done");
      plan = markPlanStep(plan, "use-tools", "in_progress");
      logger.emit("plan_updated", { plan }, turnId);
      state = transition(logger, turnId, state, "TOOL_DISPATCH");

      const toolMessages: ConversationMessage[] = [];
      for (const toolCall of response.toolCalls) {
        logger.emit("tool_call", { toolCall }, turnId);
        const toolResult = await this.executeTool(toolCall);
        logger.emit("tool_result", { toolCall, toolResult }, turnId);
        toolMessages.push({
          role: "tool",
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          content: toolResult.content,
          ok: toolResult.ok
        });
      }

      conversation = [...conversation, ...toolMessages];
      context = appendWorkingMessages(context, toolMessages);
      state = transition(logger, turnId, state, "TOOL_RESULT");
    }

    if (state !== "DONE" && state !== "ERROR") {
      state = transition(logger, turnId, state, "ERROR");
      output = "Run stopped after reaching the max turn limit.";
      logger.emit("error", { output }, turnId);
    }

    logger.emit("run_finished", { finalState: state, output }, turnId);
    return {
      finalState: state,
      output,
      events: logger.snapshot(),
      plan
    };
  }

  private async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const tool = this.toolRegistry.get(toolCall.toolName);
    if (!tool) {
      return {
        ok: false,
        content: `Unknown tool: ${toolCall.toolName}`
      };
    }

    if (tool.definition.risk === "blocked") {
      return {
        ok: false,
        content: `Blocked tool: ${toolCall.toolName}`
      };
    }

    if (tool.definition.risk === "guarded" && !this.config.allowGuardedTools) {
      return {
        ok: false,
        content: `Guarded tool requires approval: ${toolCall.toolName}`
      };
    }

    try {
      return await tool.execute(toolCall.arguments, { cwd: this.config.cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool failure";
      return {
        ok: false,
        content: message
      };
    }
  }
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

export function createDefaultSystemPrompt(): string {
  return [
    "You are a local CLI harness runtime.",
    "Use tools through structured calls.",
    "Prefer reading before changing files.",
    "Respect safe, guarded, and blocked tool policy."
  ].join(" ");
}

export function formatAssistantOutput(message: AssistantMessage): string {
  return message.content;
}
