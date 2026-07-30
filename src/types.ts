import type { SkillRegistry } from "./skills/registry.js";

export type HarnessState =
  | "USER_INPUT"
  | "MODEL_TURN"
  | "TOOL_DISPATCH"
  | "TOOL_RESULT"
  | "DONE"
  | "ERROR";

export type ToolRisk = "safe" | "guarded" | "blocked";

export type ToolName = string;

export type EventType =
  | "session_started"
  | "session_cleared"
  | "session_ended"
  | "run_started"
  | "state_transition"
  | "plan_updated"
  | "step_checklist_updated"
  | "model_request"
  | "model_response"
  | "tool_call"
  | "approval_requested"
  | "approval_decided"
  | "workspace_bound_rejected"
  | "tool_result"
  | "subagent_started"
  | "subagent_finished"
  | "turn_finished"
  | "run_finished"
  | "error";

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ToolCall {
  callId: string;
  toolName: ToolName;
  arguments: Record<string, unknown>;
}

/** Payload for the Harness Approval pause before a guarded Tool call. */
export interface ApprovalRequest {
  toolName: ToolName;
  callId: string;
  arguments: Record<string, unknown>;
  /** Truncated Name+args summary for host prompts. */
  argumentSummary: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolResultMessage {
  role: "tool";
  callId: string;
  toolName: ToolName;
  content: string;
  ok: boolean;
}

export interface UserMessage {
  role: "user";
  content: string;
}

export type ConversationMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

export interface ProviderTurnRequest {
  systemPrompt: string;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
}

export interface ProviderTurnResponse {
  assistantMessage?: AssistantMessage;
  toolCalls: ToolCall[];
  stopReason: "tool_calls" | "completed" | "error";
  usage?: TokenUsage;
  /** Final Reasoning text when the Provider emitted a deliberation channel. */
  reasoning?: string;
}

/** Mid-Turn Provider delta for Session TUI preview (ADR-0015). */
export type ProviderStreamDelta =
  | { kind: "assistant_text"; text: string }
  | { kind: "reasoning"; text: string };

export interface ToolDefinition {
  name: ToolName;
  description: string;
  risk: ToolRisk;
  inputSchema: Record<string, unknown>;
  /**
   * Top-level argument keys that are filesystem paths subject to Workspace bound.
   * Harness checks these before Approval / execute (ADR-0010).
   */
  pathParams?: string[];
  /** When true, Compaction may clear long results (re-invoke if needed). */
  refetchable?: boolean;
}

export interface ToolExecutionContext {
  cwd: string;
  /** When false, path Tools skip Workspace bound (CLI `--no-workspace-bound`). Default true. */
  workspaceBound?: boolean;
  skillRegistry?: SkillRegistry;
  /**
   * Parent-Session callback that runs a Subagent (nested Run).
   * Absent inside a Subagent so depth stays 1.
   */
  runSubagent?: (prompt: string) => Promise<ToolExecutionResult>;
  /**
   * Plan Mode callback: write the Session Plan document (Markdown).
   * Absent outside Plan Mode so update_plan fails closed.
   */
  updatePlanDocument?: (markdown: string) => void;
}

export interface ToolExecutionResult {
  ok: boolean;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  definition: ToolDefinition;
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;
}

export interface Provider {
  readonly name: string;
  sendTurn(request: ProviderTurnRequest): Promise<ProviderTurnResponse>;
  /**
   * Optional streaming path (ADR-0015). When present, Harness prefers it.
   * Tool-call argument deltas are not surfaced; they are assembled into the
   * final ProviderTurnResponse only.
   */
  streamTurn?(
    request: ProviderTurnRequest,
    onDelta: (delta: ProviderStreamDelta) => void
  ): Promise<ProviderTurnResponse>;
}

export interface StepChecklistStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  notes?: string;
}

/** Progress layer injected into the Assembled prompt (not the Plan document). */
export interface StepChecklist {
  goal: string;
  steps: StepChecklistStep[];
}

/** @deprecated Use StepChecklistStep */
export type PlanStep = StepChecklistStep;
/** @deprecated Use StepChecklist — Plan now means the Markdown document */
export type Plan = StepChecklist;

export interface PinnedArtifact {
  id: string;
  label: string;
  content: string;
}

export interface CompactionStatus {
  clearedTools: boolean;
  summarized: boolean;
}

export interface ContextLayers {
  system: string;
  projectInstructions: string;
  task: string;
  environment: string;
  /** Compact Skill discovery index; Root set; bodies are not included. */
  skillCatalog: string;
  /** Explicit `$skill` bodies injected for the current Run only. */
  skillInstructions: string;
  workingSet: ConversationMessage[];
  summary: string[];
  pinned: PinnedArtifact[];
  compaction: CompactionStatus;
}

export interface SummaryWriter {
  write(messages: ConversationMessage[]): string;
}

export interface AssemblySnapshot {
  timestamp: string;
  tokenEstimate: number;
  compaction: CompactionStatus;
  layers: {
    system: string;
    projectInstructions: string;
    task: string;
    environment: string;
    skillCatalog: string;
    skillInstructions: string;
    summary: string[];
    workingSetCount: number;
    workingSetRoles: Array<ConversationMessage["role"]>;
    pinned: PinnedArtifact[];
    planGoal: string | null;
    planSteps: Array<{ id: string; status: StepChecklistStep["status"] }>;
    planDocument: string | null;
    planMode: boolean;
  };
}

export interface HarnessEvent {
  timestamp: string;
  runId: string;
  /** Present on nested Subagent events; links to the parent Run's runId. */
  parentRunId?: string;
  sessionId?: string;
  turnId: string | null;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  command: string;
  status: "running" | "exited";
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface HarnessConfig {
  cwd: string;
  maxTurns: number;
  allowGuardedTools: boolean;
  /**
   * When true (default), pathParams on Tools are confined under Session cwd.
   * Disable only via explicit `--no-workspace-bound` (orthogonal to allowGuardedTools).
   */
  workspaceBound?: boolean;
  systemPrompt: string;
  tokenBudget: number;
  /** Optional override for Skill discovery home directory (tests). */
  skillsHomeDir?: string;
  /** Optional override for bundled Skills directory (tests). */
  bundledSkillsDir?: string;
  /**
   * Host callback for interactive Approval of guarded Tool calls.
   * When unset and `--allow-guarded-tools` is off, guarded calls Soft-deny.
   */
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>;
  /** When true, write each Assembled prompt to dumpPromptsDir before Provider send. */
  dumpPrompts?: boolean;
  /** Absolute or cwd-relative directory for prompt dumps. Defaults to `<cwd>/.honey/prompt-dumps`. */
  dumpPromptsDir?: string;
  /**
   * When true (default), persist a Session event log JSONL under sessionEventLogDir.
   * Set false to disable disk writes (useful for evals and focused unit tests).
   */
  sessionEventLog?: boolean;
  /** Absolute or cwd-relative directory for Session event logs. Defaults to `<cwd>/.honey/session-logs`. */
  sessionEventLogDir?: string;
  /** Optional Session mode recorded on session_started. */
  sessionMode?: "repl" | "command";
}

export interface HarnessRunResult {
  finalState: HarnessState;
  output: string;
  events: HarnessEvent[];
  stepChecklist: StepChecklist;
  /** @deprecated Use stepChecklist */
  plan: StepChecklist;
}

export interface SessionSnapshot {
  transcript: ConversationMessage[];
  /** @deprecated Use transcript. Kept temporarily for migration clarity in callers. */
  messages: ConversationMessage[];
  context: ContextLayers;
  stepChecklist: StepChecklist | null;
  /** Session Plan document (Markdown); null when empty/cleared. */
  plan: string | null;
  planMode: boolean;
  /** Parallel Session Reasoning entries (never Assembled / Working set). */
  reasoning: string[];
  history: HarnessRunResult[];
  assemblySnapshots: AssemblySnapshot[];
}
