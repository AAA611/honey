import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleProviderMessages,
  assembleSystemPrompt,
  createAssemblySnapshot
} from "../context/assemble.js";
import { compactIfNeeded } from "../context/compact.js";
import { formatContextInventory } from "../context/inventory.js";
import { appendWorkingMessages, createContextLayers } from "../context/layers.js";
import { autoPinFromUserInput } from "../context/pin.js";
import { loadProjectInstructions } from "../context/projectInstructions.js";
import {
  decideTaskTransition,
  stripTaskSwitchPrefix
} from "../context/taskTransition.js";
import { EventLogger } from "../logging/eventLogger.js";
import { createInitialPlan, markPlanStep } from "../planning/plan.js";
import { ToolRegistry } from "../tools/registry.js";
import type {
  AssemblySnapshot,
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
  private transcript: ConversationMessage[] = [];
  private context: ContextLayers;
  private plan: Plan | null = null;
  private readonly history: HarnessRunResult[] = [];
  private readonly assemblySnapshots: AssemblySnapshot[] = [];

  constructor(private readonly runtime: HarnessRuntime) {
    this.context = createContextLayers({
      system: this.runtime.config.systemPrompt,
      projectInstructions: loadProjectInstructions(this.runtime.config.cwd),
      environment: formatEnvironment(this.runtime.config)
    });
  }

  async runTurn(userInput: string): Promise<HarnessRunResult> {
    const logger = new EventLogger();
    const turnId = randomUUID();
    let state: HarnessState = "USER_INPUT";
    let output = "";

    const transitionKind = decideTaskTransition({
      userInput,
      currentTask: this.context.task,
      plan: this.plan
    });
    const effectiveInput =
      transitionKind === "replace" ? stripTaskSwitchPrefix(userInput) : userInput;

    if (transitionKind === "replace" || !this.plan) {
      this.context = {
        ...this.context,
        task: formatTask(effectiveInput)
      };
      this.plan = createInitialPlan(effectiveInput);
    }

    this.context = {
      ...this.context,
      pinned: autoPinFromUserInput(
        effectiveInput,
        this.context.pinned,
        (relativePath) => readExcerpt(this.runtime.config.cwd, relativePath)
      )
    };

    const userMessage: ConversationMessage = {
      role: "user",
      content: effectiveInput
    };
    this.transcript = [...this.transcript, userMessage];
    this.context = appendWorkingMessages(this.context, [userMessage]);
    this.context = compactIfNeeded(
      this.context,
      this.plan,
      this.runtime.config.tokenBudget
    );

    logger.emit(
      "run_started",
      { provider: this.runtime.provider.name, input: effectiveInput },
      turnId
    );
    logger.emit("plan_updated", { plan: this.plan }, turnId);

    for (let turn = 0; turn < this.runtime.config.maxTurns; turn += 1) {
      state = transition(logger, turnId, state, "MODEL_TURN");
      this.context = compactIfNeeded(
        this.context,
        this.plan,
        this.runtime.config.tokenBudget
      );
      const assembledSystem = assembleSystemPrompt(this.context, this.plan);
      const assembledMessages = assembleProviderMessages(this.context);
      const assemblySnapshot = createAssemblySnapshot(this.context, this.plan);
      this.assemblySnapshots.push(assemblySnapshot);

      logger.emit(
        "model_request",
        {
          assembled: true,
          systemPrompt: assembledSystem,
          task: this.context.task,
          projectInstructionsChars: this.context.projectInstructions.length,
          summary: this.context.summary,
          workingSetCount: this.context.workingSet.length,
          pinnedCount: this.context.pinned.length,
          environment: this.context.environment,
          tokenEstimate: assemblySnapshot.tokenEstimate,
          compaction: this.context.compaction
        },
        turnId
      );

      let response;
      try {
        response = await this.runtime.provider.sendTurn({
          systemPrompt: assembledSystem,
          messages: assembledMessages,
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
        this.transcript = [...this.transcript, response.assistantMessage];
        this.context = appendWorkingMessages(this.context, [
          response.assistantMessage
        ]);
      }

      if (response.stopReason === "completed" && response.assistantMessage) {
        state = transition(logger, turnId, state, "DONE");
        this.plan = markPlanStep(this.plan, "understand-request", "done");
        this.plan = markPlanStep(this.plan, "use-tools", "done");
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

      this.transcript = [...this.transcript, ...toolMessages];
      this.context = appendWorkingMessages(this.context, toolMessages);
      this.context = compactIfNeeded(
        this.context,
        this.plan,
        this.runtime.config.tokenBudget
      );
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
      plan: this.plan!
    };
    this.history.push(result);
    return result;
  }

  formatContextInventory(): string {
    return formatContextInventory(
      this.context,
      this.plan,
      this.runtime.config.tokenBudget
    );
  }

  clear(): void {
    this.transcript = [];
    this.plan = null;
    this.history.length = 0;
    this.assemblySnapshots.length = 0;
    const projectInstructions = this.context.projectInstructions;
    this.context = createContextLayers({
      system: this.runtime.config.systemPrompt,
      projectInstructions,
      environment: formatEnvironment(this.runtime.config)
    });
  }

  snapshot(): SessionSnapshot {
    const transcript = [...this.transcript];
    return {
      transcript,
      messages: transcript,
      context: {
        ...this.context,
        workingSet: [...this.context.workingSet],
        summary: [...this.context.summary],
        pinned: this.context.pinned.map((item) => ({ ...item })),
        compaction: { ...this.context.compaction }
      },
      plan: this.plan,
      history: [...this.history],
      assemblySnapshots: this.assemblySnapshots.map((item) => ({
        ...item,
        layers: {
          ...item.layers,
          summary: [...item.layers.summary],
          workingSetRoles: [...item.layers.workingSetRoles],
          planSteps: item.layers.planSteps.map((step) => ({ ...step })),
          pinned: item.layers.pinned.map((pinned) => ({ ...pinned }))
        },
        compaction: { ...item.compaction }
      }))
    };
  }
}

export function createHarnessSession(runtime: HarnessRuntime): HarnessSession {
  return new HarnessSession(runtime);
}

function formatTask(userInput: string): string {
  return `Goal: ${userInput}\nAcceptance: complete the request and report outcomes.`;
}

function formatEnvironment(config: HarnessConfig): string {
  return [
    `cwd: ${config.cwd}`,
    `allowGuardedTools: ${config.allowGuardedTools}`,
    `tokenBudget: ${config.tokenBudget}`
  ].join("\n");
}

function readExcerpt(cwd: string, relativePath: string): string | null {
  try {
    const content = readFileSync(join(cwd, relativePath), "utf8");
    return content.slice(0, 1_200);
  } catch {
    return null;
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
