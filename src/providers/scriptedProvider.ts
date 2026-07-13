import type {
  ConversationMessage,
  Provider,
  ProviderTurnRequest,
  ProviderTurnResponse,
  ToolCall
} from "../types.js";

interface ScriptedStep {
  when(request: ProviderTurnRequest): boolean;
  response(request: ProviderTurnRequest): ProviderTurnResponse;
}

function lastMessage(messages: ConversationMessage[]) {
  return messages[messages.length - 1];
}

export class ScriptedProvider implements Provider {
  readonly name = "scripted-provider";

  private readonly steps: ScriptedStep[];

  constructor(steps?: ScriptedStep[]) {
    this.steps = steps ?? defaultScript();
  }

  async sendTurn(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    const match = this.steps.find((step) => step.when(request));
    if (!match) {
      return {
        assistantMessage: {
          role: "assistant",
          content: "No scripted response matched the current turn."
        },
        toolCalls: [],
        stopReason: "completed"
      };
    }

    return match.response(request);
  }
}

function defaultScript(): ScriptedStep[] {
  return [
    {
      when: (request) => {
        const message = lastMessage(request.messages);
        return message?.role === "user" && message.content.includes("search:");
      },
      response: (request) => {
        const message = lastMessage(request.messages);
        const query = message?.content.split("search:")[1]?.trim() ?? "";
        return {
          toolCalls: [toolCall("search_workspace", { query })],
          stopReason: "tool_calls"
        };
      }
    },
    {
      when: (request) => {
        const message = lastMessage(request.messages);
        return message?.role === "user" && message.content.includes("read:");
      },
      response: (request) => {
        const message = lastMessage(request.messages);
        const path = message?.content.split("read:")[1]?.trim() ?? "";
        return {
          toolCalls: [toolCall("read_file", { path })],
          stopReason: "tool_calls"
        };
      }
    },
    {
      when: (request) => lastMessage(request.messages)?.role === "tool",
      response: (request) => {
        const message = lastMessage(request.messages);
        return {
          assistantMessage: {
            role: "assistant",
            content: `Tool result received:\n${message?.content ?? ""}`
          },
          toolCalls: [],
          stopReason: "completed"
        };
      }
    },
    {
      when: () => true,
      response: () => ({
        assistantMessage: {
          role: "assistant",
          content:
            "Scripted provider is ready. Use prompts like `search: term` or `read: path` to exercise the tool loop."
        },
        toolCalls: [],
        stopReason: "completed"
      })
    }
  ];
}

function toolCall(
  toolName: ToolCall["toolName"],
  args: Record<string, unknown>
): ToolCall {
  return {
    callId: `${toolName}-call`,
    toolName,
    arguments: args
  };
}
