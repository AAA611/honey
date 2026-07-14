import type {
  ConversationMessage,
  Provider,
  ProviderTurnRequest,
  ProviderTurnResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolName
} from "../types.js";

export type HttpTransport = (
  input: string,
  init: RequestInit
) => Promise<Response>;

export interface OpenAiCompatibleProviderOptions {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  transport?: HttpTransport;
}

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const KNOWN_TOOLS = new Set<string>([
  "read_file",
  "search_workspace",
  "exec_command",
  "apply_patch",
  "run_tests"
]);

export class OpenAiCompatibleProvider implements Provider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly transport: HttpTransport;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.transport = options.transport ?? fetch;
  }

  async sendTurn(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      stream: false,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages.map(toOpenAiMessage)
      ],
      tools: request.tools.map(toOpenAiTool),
      tool_choice: request.tools.length > 0 ? "auto" : undefined
    };

    const response = await this.transport(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();
    let payload: OpenAiChatCompletionResponse;
    try {
      payload = JSON.parse(rawText) as OpenAiChatCompletionResponse;
    } catch {
      throw new Error(
        `OpenAI-compatible provider returned non-JSON (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      const detail = payload.error?.message ?? rawText.slice(0, 200);
      throw new Error(
        `OpenAI-compatible provider HTTP ${response.status}: ${detail}`
      );
    }

    return mapCompletionToProviderResponse(payload);
  }
}

function toOpenAiMessage(message: ConversationMessage): OpenAiChatMessage {
  if (message.role === "user") {
    return { role: "user", content: message.content };
  }
  if (message.role === "assistant") {
    const openAiMessage: OpenAiChatMessage = {
      role: "assistant",
      content: message.content.length > 0 ? message.content : null
    };
    if (message.toolCalls && message.toolCalls.length > 0) {
      openAiMessage.tool_calls = message.toolCalls.map((toolCall) => ({
        id: toolCall.callId,
        type: "function",
        function: {
          name: toolCall.toolName,
          arguments: JSON.stringify(toolCall.arguments)
        }
      }));
    }
    return openAiMessage;
  }
  return {
    role: "tool",
    tool_call_id: message.callId,
    content: message.content
  };
}

function toOpenAiTool(tool: ToolDefinition) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function mapCompletionToProviderResponse(
  payload: OpenAiChatCompletionResponse
): ProviderTurnResponse {
  const choice = payload.choices?.[0];
  if (!choice?.message) {
    throw new Error("OpenAI-compatible provider returned no choices.");
  }

  const usage = mapUsage(payload.usage);
  const toolCalls = (choice.message.tool_calls ?? []).map(mapToolCall);
  const content = choice.message.content?.trim() ?? "";

  if (toolCalls.length > 0 || choice.finish_reason === "tool_calls") {
    return {
      assistantMessage: {
        role: "assistant",
        content,
        toolCalls
      },
      toolCalls,
      stopReason: "tool_calls",
      usage
    };
  }

  if (content.length === 0) {
    throw new Error("OpenAI-compatible provider returned an empty assistant message.");
  }

  return {
    assistantMessage: {
      role: "assistant",
      content
    },
    toolCalls: [],
    stopReason: "completed",
    usage
  };
}

function mapUsage(
  usage: OpenAiChatCompletionResponse["usage"]
): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens
  };
}

function mapToolCall(toolCall: OpenAiToolCall): ToolCall {
  if (!KNOWN_TOOLS.has(toolCall.function.name)) {
    throw new Error(
      `OpenAI-compatible provider returned unknown tool "${toolCall.function.name}".`
    );
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    throw new Error(
      `OpenAI-compatible provider returned malformed tool arguments for "${toolCall.function.name}".`
    );
  }

  return {
    callId: toolCall.id,
    toolName: toolCall.function.name as ToolName,
    arguments: args
  };
}
