export type HarnessState =
  | "USER_INPUT"
  | "MODEL_TURN"
  | "TOOL_DISPATCH"
  | "TOOL_RESULT"
  | "DONE"
  | "ERROR";

export type ToolRisk = "safe" | "guarded" | "blocked";

export type ToolName =
  | "read_file"
  | "search_workspace"
  | "exec_command"
  | "apply_patch"
  | "run_tests";

export type EventType =
  | "run_started"
  | "state_transition"
  | "plan_updated"
  | "model_request"
  | "model_response"
  | "tool_call"
  | "tool_result"
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
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  risk: ToolRisk;
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionContext {
  cwd: string;
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
}

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  notes?: string;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

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
    summary: string[];
    workingSetCount: number;
    workingSetRoles: Array<ConversationMessage["role"]>;
    pinned: PinnedArtifact[];
    planGoal: string | null;
    planSteps: Array<{ id: string; status: PlanStep["status"] }>;
  };
}

export interface HarnessEvent {
  timestamp: string;
  runId: string;
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
  systemPrompt: string;
  tokenBudget: number;
}

export interface HarnessRunResult {
  finalState: HarnessState;
  output: string;
  events: HarnessEvent[];
  plan: Plan;
}

export interface SessionSnapshot {
  transcript: ConversationMessage[];
  /** @deprecated Use transcript. Kept temporarily for migration clarity in callers. */
  messages: ConversationMessage[];
  context: ContextLayers;
  plan: Plan | null;
  history: HarnessRunResult[];
  assemblySnapshots: AssemblySnapshot[];
}
