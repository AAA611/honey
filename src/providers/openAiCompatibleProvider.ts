import type {
  ConversationMessage,
  Provider,
  ProviderStreamDelta,
  ProviderTurnRequest,
  ProviderTurnResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition
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
      reasoning_content?: string | null;
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

interface OpenAiStreamChunk {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
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
    const response = await this.postChat(request, false);
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

  async streamTurn(
    request: ProviderTurnRequest,
    onDelta: (delta: ProviderStreamDelta) => void
  ): Promise<ProviderTurnResponse> {
    const response = await this.postChat(request, true);
    if (!response.ok) {
      const rawText = await response.text();
      let detail = rawText.slice(0, 200);
      try {
        const payload = JSON.parse(rawText) as OpenAiChatCompletionResponse;
        detail = payload.error?.message ?? detail;
      } catch {
        // keep text slice
      }
      throw new Error(
        `OpenAI-compatible provider HTTP ${response.status}: ${detail}`
      );
    }

    const assembler = createSseAssembler(onDelta);
    if (!response.body) {
      assembler.pushText(await response.text());
      return assembler.finish();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      assembler.pushText(decoder.decode(value, { stream: true }));
    }
    assembler.pushText(decoder.decode());
    return assembler.finish();
  }

  private async postChat(
    request: ProviderTurnRequest,
    stream: boolean
  ): Promise<Response> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      stream,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages.map(toOpenAiMessage)
      ],
      tools: request.tools.map(toOpenAiTool),
      tool_choice: request.tools.length > 0 ? "auto" : undefined
    };

    return this.transport(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(stream ? { accept: "text/event-stream" } : {})
      },
      body: JSON.stringify(body)
    });
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
  const reasoning = choice.message.reasoning_content?.trim() || undefined;

  if (toolCalls.length > 0 || choice.finish_reason === "tool_calls") {
    return {
      assistantMessage: {
        role: "assistant",
        content,
        toolCalls
      },
      toolCalls,
      stopReason: "tool_calls",
      usage,
      reasoning
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
    usage,
    reasoning
  };
}

/** Exported for unit tests of SSE assembly. */
export function parseSseChatCompletion(
  rawText: string,
  onDelta: (delta: ProviderStreamDelta) => void
): ProviderTurnResponse {
  const assembler = createSseAssembler(onDelta);
  assembler.pushText(rawText);
  return assembler.finish();
}

interface SseAssembler {
  pushText(chunk: string): void;
  finish(): ProviderTurnResponse;
}

function createSseAssembler(
  onDelta: (delta: ProviderStreamDelta) => void
): SseAssembler {
  let buffer = "";
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let usage: TokenUsage | undefined;
  const toolCallBuilders = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  function consumeLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }
    const data = trimmed.slice("data:".length).trim();
    if (data === "[DONE]" || data.length === 0) {
      return;
    }

    let chunk: OpenAiStreamChunk;
    try {
      chunk = JSON.parse(data) as OpenAiStreamChunk;
    } catch {
      throw new Error("OpenAI-compatible provider returned malformed SSE JSON.");
    }

    if (chunk.error?.message) {
      throw new Error(
        `OpenAI-compatible provider stream error: ${chunk.error.message}`
      );
    }

    if (chunk.usage) {
      usage = mapUsage(chunk.usage);
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      return;
    }
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }

    const delta = choice.delta;
    if (!delta) {
      return;
    }

    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
      onDelta({ kind: "assistant_text", text: delta.content });
    }

    if (
      typeof delta.reasoning_content === "string" &&
      delta.reasoning_content.length > 0
    ) {
      reasoning += delta.reasoning_content;
      onDelta({ kind: "reasoning", text: delta.reasoning_content });
    }

    for (const toolDelta of delta.tool_calls ?? []) {
      const index = toolDelta.index ?? 0;
      const existing = toolCallBuilders.get(index) ?? {
        id: "",
        name: "",
        arguments: ""
      };
      if (toolDelta.id) {
        existing.id = toolDelta.id;
      }
      if (toolDelta.function?.name) {
        existing.name = toolDelta.function.name;
      }
      if (toolDelta.function?.arguments) {
        existing.arguments += toolDelta.function.arguments;
      }
      toolCallBuilders.set(index, existing);
    }
  }

  return {
    pushText(chunk: string): void {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        consumeLine(line);
      }
    },
    finish(): ProviderTurnResponse {
      if (buffer.trim().length > 0) {
        consumeLine(buffer);
        buffer = "";
      }

      const toolCalls = [...toolCallBuilders.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, builder]) =>
          mapToolCall({
            id: builder.id,
            type: "function",
            function: {
              name: builder.name,
              arguments: builder.arguments.length > 0 ? builder.arguments : "{}"
            }
          })
        );

      const reasoningFinal = reasoning.trim() || undefined;

      if (toolCalls.length > 0 || finishReason === "tool_calls") {
        return {
          assistantMessage: {
            role: "assistant",
            content: content.trim(),
            toolCalls
          },
          toolCalls,
          stopReason: "tool_calls",
          usage,
          reasoning: reasoningFinal
        };
      }

      const trimmed = content.trim();
      if (trimmed.length === 0) {
        throw new Error(
          "OpenAI-compatible provider returned an empty assistant message."
        );
      }

      return {
        assistantMessage: {
          role: "assistant",
          content: trimmed
        },
        toolCalls: [],
        stopReason: "completed",
        usage,
        reasoning: reasoningFinal
      };
    }
  };
}

function mapUsage(
  usage:
    | OpenAiChatCompletionResponse["usage"]
    | OpenAiStreamChunk["usage"]
    | undefined
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
  const toolName = toolCall.function.name;
  if (!toolName) {
    throw new Error(
      "OpenAI-compatible provider returned a tool call with an empty name."
    );
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    throw new Error(
      `OpenAI-compatible provider returned malformed tool arguments for "${toolName}".`
    );
  }

  return {
    callId: toolCall.id,
    toolName,
    arguments: args
  };
}
