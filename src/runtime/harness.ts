import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compactIfNeeded } from "../context/compact.js";
import { formatContextInventory } from "../context/inventory.js";
import { appendWorkingMessages, createContextLayers } from "../context/layers.js";
import { autoPinFromUserInput } from "../context/pin.js";
import {
  loadProjectInstructions,
  type ProjectInstructionsLoadResult
} from "../context/projectInstructions.js";
import {
  defaultDumpPromptsDir,
  dumpAssembledPrompt
} from "../context/promptDump.js";
import {
  decideTaskTransition,
  stripTaskSwitchPrefix
} from "../context/taskTransition.js";
import { EventLogger } from "../logging/eventLogger.js";
import {
  defaultSessionEventLogDir,
  SessionEventLog
} from "../logging/sessionEventLog.js";
import {
  createExecutionStepChecklist,
  createPlanningStepChecklist
} from "../planning/plan.js";
import { formatExplicitSkillInstructions } from "../skills/catalog.js";
import { SkillRegistry } from "../skills/registry.js";
import { ToolRegistry } from "../tools/registry.js";
import type {
  AssemblySnapshot,
  AssistantMessage,
  ConversationMessage,
  ContextLayers,
  HarnessConfig,
  HarnessRunResult,
  StepChecklist,
  Provider,
  SessionSnapshot,
  Tool,
  ToolCall,
  ToolDefinition,
  ToolExecutionResult
} from "../types.js";
import { createApprovalRequest } from "./approval.js";
import {
  isPlanModeToolAllowed,
  UPDATE_PLAN_TOOL_NAME
} from "./planMode.js";
import { formatSoftFailure } from "./softFailure.js";
import {
  formatSubagentResult,
  SPAWN_SUBAGENT_TOOL_NAME
} from "./subagent.js";
import { runTurnLoop, type TurnLoopScope } from "./turnLoop.js";
import { checkToolCallWorkspaceBound } from "./workspaceBound.js";

export class HarnessRuntime {
  readonly toolRegistry: ToolRegistry;
  readonly skillRegistry: SkillRegistry;

  constructor(
    readonly provider: Provider,
    tools: Tool[],
    readonly config: HarnessConfig,
    skillRegistry?: SkillRegistry
  ) {
    this.skillRegistry =
      skillRegistry ??
      SkillRegistry.discover({
        cwd: config.cwd,
        homeDir: config.skillsHomeDir,
        bundledSkillsDir: config.bundledSkillsDir
      });
    this.toolRegistry = new ToolRegistry(tools);
  }

  refetchableToolNames(): Set<string> {
    const names = new Set<string>();
    for (const definition of this.toolRegistry.definitions()) {
      if (definition.refetchable) {
        names.add(definition.name);
      }
    }
    return names;
  }

  async run(userInput: string): Promise<HarnessRunResult> {
    const session = createHarnessSession(this);
    try {
      return await session.runTurn(userInput);
    } finally {
      session.end();
    }
  }

  async executeTool(
    toolCall: ToolCall,
    options?: {
      logger?: EventLogger;
      turnId?: string | null;
      runSubagent?: (prompt: string) => Promise<ToolExecutionResult>;
      updatePlanDocument?: (markdown: string) => void;
      planMode?: boolean;
    }
  ): Promise<ToolExecutionResult> {
    const tool = this.toolRegistry.get(toolCall.toolName);
    if (!tool) {
      return {
        ok: false,
        content: formatSoftFailure(
          `Unknown tool: ${toolCall.toolName}`,
          "That name is not on this Run's Tool surface",
          "Pick a Tool from the offered list, or adjust the Task to available Tools"
        )
      };
    }

    if (options?.planMode && !isPlanModeToolAllowed(toolCall.toolName)) {
      return {
        ok: false,
        content: formatSoftFailure(
          `Tool not available in Plan Mode: ${toolCall.toolName}`,
          "Plan Mode only allows the read allowlist plus update_plan",
          "Use read_file / search_workspace / update_plan, or leave Plan Mode before mutating"
        )
      };
    }

    if (!options?.planMode && toolCall.toolName === UPDATE_PLAN_TOOL_NAME) {
      return {
        ok: false,
        content: formatSoftFailure(
          "update_plan is only available in Plan Mode",
          "The Session is not in Plan Mode",
          "Enter Plan Mode with /plan before calling update_plan, or continue without it"
        )
      };
    }

    if (tool.definition.risk === "blocked") {
      return {
        ok: false,
        content: formatSoftFailure(
          `Blocked tool: ${toolCall.toolName}`,
          "This Tool is blocked by policy for the Run",
          "Choose a different Tool that can achieve the Task"
        )
      };
    }

    const workspaceBoundEnabled = this.config.workspaceBound !== false;
    if (workspaceBoundEnabled) {
      const bound = await checkToolCallWorkspaceBound({
        cwd: this.config.cwd,
        pathParams: tool.definition.pathParams,
        arguments: toolCall.arguments
      });
      if (!bound.ok) {
        const logger = options?.logger;
        const turnId = options?.turnId ?? null;
        logger?.emit(
          "workspace_bound_rejected",
          {
            toolCall,
            reason: bound.reason,
            attemptedPath: bound.attemptedPath
          },
          turnId
        );
        return {
          ok: false,
          content: formatSoftFailure(
            `Workspace bound rejected path for ${toolCall.toolName}`,
            bound.reason,
            "Use a path under the Session cwd, or ask about disabling Workspace bound if escape is intentional"
          )
        };
      }
    }

    if (tool.definition.risk === "guarded" && !this.config.allowGuardedTools) {
      const approvalRequest = createApprovalRequest(toolCall);
      const logger = options?.logger;
      const turnId = options?.turnId ?? null;
      logger?.emit(
        "approval_requested",
        {
          toolCall,
          argumentSummary: approvalRequest.argumentSummary
        },
        turnId
      );

      const allowed = this.config.requestApproval
        ? await this.config.requestApproval(approvalRequest)
        : false;

      logger?.emit(
        "approval_decided",
        {
          toolCall,
          allowed,
          argumentSummary: approvalRequest.argumentSummary,
          viaHost: Boolean(this.config.requestApproval)
        },
        turnId
      );

      if (!allowed) {
        if (this.config.requestApproval) {
          return {
            ok: false,
            content: formatSoftFailure(
              `User denied Approval for ${toolCall.toolName}`,
              "The user refused this guarded Tool call",
              "Try a safer Tool, revise the call, or ask the user to approve a different approach"
            )
          };
        }
        return {
          ok: false,
          content: formatSoftFailure(
            `Guarded tool requires Approval: ${toolCall.toolName}`,
            "No Approval host is wired and --allow-guarded-tools is off",
            "Re-run with an Approval host (Session TUI/REPL) or --allow-guarded-tools, or use a safe Tool"
          )
        };
      }
    }

    try {
      return await tool.execute(toolCall.arguments, {
        cwd: this.config.cwd,
        workspaceBound: this.config.workspaceBound !== false,
        skillRegistry: this.skillRegistry,
        runSubagent: options?.runSubagent,
        updatePlanDocument: options?.updatePlanDocument
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool failure";
      return {
        ok: false,
        content: formatSoftFailure(
          `Tool ${toolCall.toolName} threw`,
          message,
          "Diagnose the error, then change arguments, switch Tools, or probe before retrying"
        )
      };
    }
  }
}

export class HarnessSession {
  private transcript: ConversationMessage[] = [];
  private context: ContextLayers;
  private stepChecklist: StepChecklist | null = null;
  /** Session Plan document (Markdown). */
  private planDocument: string | null = null;
  private planMode = false;
  private readonly history: HarnessRunResult[] = [];
  private readonly assemblySnapshots: AssemblySnapshot[] = [];
  private projectInstructionsMeta: ProjectInstructionsLoadResult;
  readonly sessionId = randomUUID();
  private dumpSequence = 0;
  private readonly eventLog: SessionEventLog | null;

  constructor(private readonly runtime: HarnessRuntime) {
    this.projectInstructionsMeta = this.loadInstructions();
    this.context = createContextLayers({
      system: this.runtime.config.systemPrompt,
      projectInstructions: this.projectInstructionsMeta.text,
      environment: formatEnvironment(this.runtime.config),
      skillCatalog: this.runtime.skillRegistry.catalogText()
    });
    this.eventLog = createSessionEventLog(this.sessionId, this.runtime.config);
  }

  get sessionEventLogPath(): string | null {
    return this.eventLog?.path ?? null;
  }

  /** Enter Plan Mode (Session posture). Re-entry after execute is allowed. */
  enterPlanMode(): void {
    this.planMode = true;
    const goal = this.context.task.trim() || "draft a Plan";
    this.stepChecklist = createPlanningStepChecklist(goal);
  }

  /** Leave Plan Mode; keep Plan document as draft. */
  exitPlanMode(): void {
    this.planMode = false;
  }

  /**
   * Leave Plan Mode, promote Plan → Task, rebuild execution Step checklist.
   * Transcript / Working set soft-continue. Empty Plan rejects.
   */
  executePlan(): { ok: true } | { ok: false; reason: string } {
    const markdown = this.planDocument?.trim() ?? "";
    if (!markdown) {
      return {
        ok: false,
        reason: "Plan document is empty — call update_plan before /execute"
      };
    }
    this.planMode = false;
    this.context = {
      ...this.context,
      task: formatTaskFromPlan(markdown)
    };
    this.stepChecklist = createExecutionStepChecklist(
      firstLineGoal(markdown) || "execute Plan"
    );
    return { ok: true };
  }

  private assembleOptions() {
    return {
      stepChecklist: this.stepChecklist,
      planDocument: this.planDocument,
      planMode: this.planMode
    };
  }

  private compactContext(context: ContextLayers = this.context): ContextLayers {
    return compactIfNeeded(
      context,
      this.stepChecklist,
      this.runtime.config.tokenBudget,
      undefined,
      this.runtime.refetchableToolNames(),
      this.assembleOptions()
    );
  }

  private offeredToolDefinitions(): ToolDefinition[] {
    const all = this.runtime.toolRegistry.definitions();
    if (this.planMode) {
      return all.filter((definition) => isPlanModeToolAllowed(definition.name));
    }
    return all.filter(
      (definition) => definition.name !== UPDATE_PLAN_TOOL_NAME
    );
  }

  private setPlanDocument(markdown: string, logger?: EventLogger, turnId?: string) {
    this.planDocument = markdown;
    logger?.emit("plan_updated", { plan: markdown }, turnId ?? null);
  }

  async runTurn(userInput: string): Promise<HarnessRunResult> {
    const logger = new EventLogger({
      sessionId: this.sessionId,
      onEmit: (event) => this.eventLog?.append(event)
    });
    const turnId = randomUUID();

    const transitionKind = decideTaskTransition({
      userInput,
      currentTask: this.context.task,
      stepChecklist: this.stepChecklist
    });
    const transitionInput =
      transitionKind === "replace" ? stripTaskSwitchPrefix(userInput) : userInput;

    const mention = this.runtime.skillRegistry.resolveMentions(transitionInput);
    const effectiveInput = mention.strippedInput;
    const skillInstructions = formatExplicitSkillInstructions(mention.skills);

    if (transitionKind === "replace" || !this.stepChecklist) {
      this.context = {
        ...this.context,
        task: formatTask(effectiveInput)
      };
      this.stepChecklist = this.planMode
        ? createPlanningStepChecklist(effectiveInput)
        : createExecutionStepChecklist(effectiveInput);
    }

    this.context = {
      ...this.context,
      skillCatalog: this.runtime.skillRegistry.catalogText(),
      skillInstructions,
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
    this.context = this.compactContext();

    logger.emit(
      "run_started",
      {
        provider: this.runtime.provider.name,
        input: effectiveInput,
        explicitSkills: mention.skills.map((skill) => skill.name),
        unknownSkills: mention.unknown,
        planMode: this.planMode
      },
      turnId
    );
    logger.emit(
      "step_checklist_updated",
      { stepChecklist: this.stepChecklist },
      turnId
    );

    const scope: TurnLoopScope = {
      logger,
      turnId,
      maxTurns: this.runtime.config.maxTurns,
      tokenBudget: this.runtime.config.tokenBudget,
      provider: this.runtime.provider,
      tools: this.offeredToolDefinitions(),
      refetchableToolNames: this.runtime.refetchableToolNames(),
      context: this.context,
      stepChecklist: this.stepChecklist!,
      getPlanMode: () => this.planMode,
      getPlanDocument: () => this.planDocument,
      transcript: this.transcript,
      executeTool: (toolCall) =>
        this.runtime.executeTool(toolCall, {
          logger,
          turnId,
          planMode: this.planMode,
          updatePlanDocument: this.planMode
            ? (markdown) => this.setPlanDocument(markdown, logger, turnId)
            : undefined,
          runSubagent: this.planMode
            ? undefined
            : (prompt) => this.runSubagent(prompt, logger)
        }),
      recordAssemblySnapshot: (snapshot) => {
        this.assemblySnapshots.push(snapshot);
      },
      dumpAssembledPrompt: this.runtime.config.dumpPrompts
        ? ({ systemPrompt, messages, tokenEstimate }) => {
            this.dumpSequence += 1;
            return dumpAssembledPrompt({
              directory:
                this.runtime.config.dumpPromptsDir ??
                defaultDumpPromptsDir(this.runtime.config.cwd),
              sessionId: this.sessionId,
              turnId,
              sequence: this.dumpSequence,
              systemPrompt,
              messages,
              tokenEstimate
            });
          }
        : undefined,
      modelRequestExtras: (context) => ({
        projectInstructionsChars: context.projectInstructions.length,
        summary: context.summary,
        pinnedCount: context.pinned.length,
        skillCatalogChars: context.skillCatalog.length,
        skillInstructionsChars: context.skillInstructions.length,
        environment: context.environment,
        compaction: context.compaction,
        planMode: this.planMode
      })
    };

    const loopResult = await runTurnLoop(scope);
    this.context = scope.context;
    this.stepChecklist = scope.stepChecklist;
    const state = loopResult.finalState;
    const output = loopResult.output;

    logger.emit("run_finished", { finalState: state, output }, turnId);
    const checklist = this.stepChecklist!;
    const result: HarnessRunResult = {
      finalState: state,
      output,
      events: logger.snapshot(),
      stepChecklist: checklist,
      plan: checklist
    };
    this.history.push(result);
    return result;
  }

  /**
   * Run a Subagent (nested Run) with an isolated Assembled prompt.
   * Does not mutate the parent Transcript / Working set; returns a Subagent result.
   */
  async runSubagent(
    prompt: string,
    parentLogger: EventLogger
  ): Promise<ToolExecutionResult> {
    const childLogger = new EventLogger({
      sessionId: this.sessionId,
      parentRunId: parentLogger.runId,
      onEmit: (event) => this.eventLog?.append(event)
    });
    const turnId = randomUUID();
    const childTools = this.runtime.toolRegistry
      .definitions()
      .filter(
        (definition) =>
          definition.name !== SPAWN_SUBAGENT_TOOL_NAME &&
          definition.name !== UPDATE_PLAN_TOOL_NAME
      );
    const refetchable = new Set(
      childTools.filter((definition) => definition.refetchable).map((d) => d.name)
    );

    childLogger.emit(
      "subagent_started",
      {
        prompt,
        parentRunId: parentLogger.runId,
        runId: childLogger.runId
      },
      turnId
    );
    childLogger.emit(
      "run_started",
      {
        provider: this.runtime.provider.name,
        input: prompt,
        nested: true,
        parentRunId: parentLogger.runId
      },
      turnId
    );

    let context = createContextLayers({
      system: this.runtime.config.systemPrompt,
      projectInstructions: this.context.projectInstructions,
      environment: this.context.environment,
      skillCatalog: this.runtime.skillRegistry.catalogText(),
      task: formatTask(prompt)
    });
    let stepChecklist: StepChecklist = createExecutionStepChecklist(prompt);
    childLogger.emit(
      "step_checklist_updated",
      { stepChecklist },
      turnId
    );

    const userMessage: ConversationMessage = {
      role: "user",
      content: prompt
    };
    context = appendWorkingMessages(context, [userMessage]);
    context = compactIfNeeded(
      context,
      stepChecklist,
      this.runtime.config.tokenBudget,
      undefined,
      refetchable,
      { planDocument: null, planMode: false }
    );

    const scope: TurnLoopScope = {
      logger: childLogger,
      turnId,
      maxTurns: this.runtime.config.maxTurns,
      tokenBudget: this.runtime.config.tokenBudget,
      provider: this.runtime.provider,
      tools: childTools,
      refetchableToolNames: refetchable,
      context,
      stepChecklist,
      getPlanMode: () => false,
      getPlanDocument: () => null,
      executeTool: (toolCall) =>
        this.runtime.executeTool(toolCall, {
          logger: childLogger,
          turnId
        }),
      modelRequestExtras: () => ({ nested: true })
    };

    const loopResult = await runTurnLoop(scope);
    const state = loopResult.finalState;
    const output = loopResult.output;

    const status = state === "DONE" ? "completed" : "error";
    const content = formatSubagentResult({
      summary: output || "(empty Subagent output)",
      status,
      run_id: childLogger.runId
    });

    childLogger.emit(
      "subagent_finished",
      {
        status,
        runId: childLogger.runId,
        parentRunId: parentLogger.runId,
        summaryChars: content.length
      },
      turnId
    );
    childLogger.emit("run_finished", { finalState: state, output }, turnId);

    return {
      ok: status === "completed",
      content,
      metadata: {
        runId: childLogger.runId,
        parentRunId: parentLogger.runId,
        status
      }
    };
  }

  formatContextInventory(): string {
    return formatContextInventory(
      this.context,
      this.stepChecklist,
      this.runtime.config.tokenBudget,
      {
        sources: this.projectInstructionsMeta.sources,
        truncated: this.projectInstructionsMeta.truncated
      },
      { planDocument: this.planDocument, planMode: this.planMode }
    );
  }

  /**
   * Re-run Project instructions discovery and replace the Root set layer.
   * Does not clear Transcript / Step checklist / Plan / Working set.
   */
  reloadProjectInstructions(): ProjectInstructionsLoadResult {
    this.projectInstructionsMeta = this.loadInstructions();
    this.context = {
      ...this.context,
      projectInstructions: this.projectInstructionsMeta.text
    };
    return this.projectInstructionsMeta;
  }

  clear(): void {
    this.transcript = [];
    this.stepChecklist = null;
    this.planDocument = null;
    this.planMode = false;
    this.history.length = 0;
    this.assemblySnapshots.length = 0;
    const projectInstructions = this.context.projectInstructions;
    this.context = createContextLayers({
      system: this.runtime.config.systemPrompt,
      projectInstructions,
      environment: formatEnvironment(this.runtime.config),
      skillCatalog: this.runtime.skillRegistry.catalogText()
    });
    this.eventLog?.clear();
  }

  private loadInstructions(): ProjectInstructionsLoadResult {
    return loadProjectInstructions({
      cwd: this.runtime.config.cwd,
      homeDir: this.runtime.config.skillsHomeDir
    });
  }

  end(): void {
    this.eventLog?.end();
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
      stepChecklist: this.stepChecklist
        ? {
            ...this.stepChecklist,
            steps: this.stepChecklist.steps.map((step) => ({ ...step }))
          }
        : null,
      plan: this.planDocument,
      planMode: this.planMode,
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

function createSessionEventLog(
  sessionId: string,
  config: HarnessConfig
): SessionEventLog | null {
  if (config.sessionEventLog === false) {
    return null;
  }
  return new SessionEventLog({
    sessionId,
    directory: config.sessionEventLogDir ?? defaultSessionEventLogDir(config.cwd),
    mode: config.sessionMode
  });
}

export function createHarnessSession(runtime: HarnessRuntime): HarnessSession {
  return new HarnessSession(runtime);
}

function formatTask(userInput: string): string {
  return `Goal: ${userInput}\nAcceptance: complete the request and report outcomes.`;
}

function formatTaskFromPlan(planMarkdown: string): string {
  return `Goal and acceptance (from Plan):\n${planMarkdown}`;
}

function firstLineGoal(planMarkdown: string): string {
  const line = planMarkdown
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line?.replace(/^#+\s*/, "") ?? "";
}

function formatEnvironment(config: HarnessConfig): string {
  return [
    `cwd: ${config.cwd}`,
    `allowGuardedTools: ${config.allowGuardedTools}`,
    `workspaceBound: ${config.workspaceBound !== false}`,
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

export function createDefaultSystemPrompt(): string {
  return [
    "You are a local CLI harness runtime.",
    "Use tools through structured calls.",
    "Prefer reading before changing files.",
    "Respect safe, guarded, and blocked tool policy.",
    "Path-taking Tools stay inside the Session cwd (Workspace bound) unless disabled.",
    "When a Skill in the catalog matches the Task, read its SKILL.md via read_file before following it.",
    "Run Skill packaged scripts only through run_skill_script.",
    "For a self-contained subtask that should not pollute this Assembled prompt, delegate with spawn_subagent and a full prompt; the Subagent cannot spawn further Subagents.",
    "When a Tool returns a Soft failure (ok false), diagnose from the result before retrying; do not blindly repeat the same failing call with the same arguments—change parameters, switch Tools, or probe first.",
    "A non-zero shell exit from exec_command is a Soft failure, not Task completion—keep working toward the Task."
  ].join(" ");
}

export function formatAssistantOutput(message: AssistantMessage): string {
  return message.content;
}
