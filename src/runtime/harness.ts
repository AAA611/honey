import { randomUUID } from "node:crypto";
import { appendWorkingMessages, createContextLayers } from "../context/layers.js";
import { EventLogger } from "../logging/eventLogger.js";
import { createInitialPlan, markPlanStep } from "../planning/plan.js";
import { ToolRegistry } from "../tools/registry.js";
import type {
  AssistantMessage,
  ConversationMessage,
  ContextLayers,
  HarnessConfig,
  HarnessRunResult,
  HarnessState,
  Plan,
  Provider,
  SessionSnapshot,
  Tool,
  ToolCall,
  ToolExecutionResult
} from "../types.js";

export class HarnessRuntime {
  constructor(
    readonly provider: Provider,
    tools: Tool[],
    readonly config: HarnessConfig
  ) {
    this.toolRegistry = new ToolRegistry(tools);
  }

  readonly toolRegistry: ToolRegistry;

  async run(userInput: string): Promise<HarnessRunResult> {
    const session = createHarnessSession(this);
    return session.runTurn(userInput);
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
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

export class HarnessSession {
  private conversation: ConversationMessage[] = [];
  private context: ContextLayers;
  private plan: Plan | null = null;
  private readonly history: HarnessRunResult[] = [];

  constructor(private readonly runtime: HarnessRuntime) {
    this.context = createContextLayers(
      this.runtime.config.systemPrompt,
      "Interactive session"
    );
  }

  async runTurn(userInput: string): Promise<HarnessRunResult> {
    const logger = new EventLogger();
    const turnId = randomUUID();
    let state: HarnessState = "USER_INPUT";
    let output = "";
    this.plan ??= createInitialPlan(userInput);

    const userMessage: ConversationMessage = { role: "user", content: userInput };
    this.conversation = [...this.conversation, userMessage];
    this.context = appendWorkingMessages(this.context, [userMessage]);

    logger.emit(
      "run_started",
      { provider: this.runtime.provider.name, input: userInput },
      turnId
    );
    logger.emit("plan_updated", { plan: this.plan }, turnId);

    for (let turn = 0; turn < this.runtime.config.maxTurns; turn += 1) {
      state = transition(logger, turnId, state, "MODEL_TURN");
      logger.emit(
        "model_request",
        {
          system: this.context.system,
          task: this.context.task,
          summary: this.context.summary,
          workingSetCount: this.context.workingSet.length
        },
        turnId
      );

      let response;
      try {
        response = await this.runtime.provider.sendTurn({
          systemPrompt: this.context.system,
          messages: [...this.conversation],
          tools: this.runtime.toolRegistry.definitions()
        });
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
          usage: response.usage
        },
        turnId
      );

      if (response.assistantMessage) {
        this.conversation = [...this.conversation, response.assistantMessage];
        this.context = appendWorkingMessages(this.context, [response.assistantMessage]);
      }

      if (response.stopReason === "completed" && response.assistantMessage) {
        state = transition(logger, turnId, state, "DONE");
        this.plan = markPlanStep(this.plan, "understand-request", "done");
        this.plan = markPlanStep(this.plan, "report", "done");
        logger.emit("plan_updated", { plan: this.plan }, turnId);
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

      this.plan = markPlanStep(this.plan, "understand-request", "done");
      this.plan = markPlanStep(this.plan, "use-tools", "in_progress");
      logger.emit("plan_updated", { plan: this.plan }, turnId);
      state = transition(logger, turnId, state, "TOOL_DISPATCH");

      const toolMessages: ConversationMessage[] = [];
      for (const toolCall of response.toolCalls) {
        logger.emit("tool_call", { toolCall }, turnId);
        const toolResult = await this.runtime.executeTool(toolCall);
        logger.emit("tool_result", { toolCall, toolResult }, turnId);
        toolMessages.push({
          role: "tool",
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          content: toolResult.content,
          ok: toolResult.ok
        });
      }

      this.conversation = [...this.conversation, ...toolMessages];
      this.context = appendWorkingMessages(this.context, toolMessages);
      state = transition(logger, turnId, state, "TOOL_RESULT");
    }

    if (state !== "DONE" && state !== "ERROR") {
      state = transition(logger, turnId, state, "ERROR");
      output = "Run stopped after reaching the max turn limit.";
      logger.emit("error", { output }, turnId);
    }

    logger.emit("run_finished", { finalState: state, output }, turnId);
    const result: HarnessRunResult = {
      finalState: state,
      output,
      events: logger.snapshot(),
      plan: this.plan
    };
    this.history.push(result);
    return result;
  }

  snapshot(): SessionSnapshot {
    return {
      messages: [...this.conversation],
      context: {
        ...this.context,
        workingSet: [...this.context.workingSet],
        summary: [...this.context.summary]
      },
      plan: this.plan,
      history: [...this.history]
    };
  }
}

export function createHarnessSession(runtime: HarnessRuntime): HarnessSession {
  return new HarnessSession(runtime);
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
