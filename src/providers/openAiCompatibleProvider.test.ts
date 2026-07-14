import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleProvider,
  type HttpTransport
} from "./openAiCompatibleProvider.js";

describe("OpenAiCompatibleProvider", () => {
  it("maps a completed chat completion into a honey Provider turn", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async () =>
        jsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: "Hello from the model."
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4
          }
        })
    });

    const response = await provider.sendTurn({
      systemPrompt: "You are honey.",
      messages: [{ role: "user", content: "hi" }],
      tools: []
    });

    expect(response).toEqual({
      assistantMessage: {
        role: "assistant",
        content: "Hello from the model."
      },
      toolCalls: [],
      stopReason: "completed",
      usage: {
        inputTokens: 10,
        outputTokens: 4
      }
    });
  });

  it("maps OpenAI tool_calls into honey tool calls", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async () =>
        jsonResponse({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "CONTEXT.md" })
                    }
                  }
                ]
              }
            }
          ]
        })
    });

    const response = await provider.sendTurn({
      systemPrompt: "You are honey.",
      messages: [{ role: "user", content: "read CONTEXT.md" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          risk: "safe",
          inputSchema: { type: "object" }
        }
      ]
    });

    expect(response.stopReason).toBe("tool_calls");
    expect(response.assistantMessage).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          callId: "call_1",
          toolName: "read_file",
          arguments: { path: "CONTEXT.md" }
        }
      ]
    });
    expect(response.toolCalls).toEqual([
      {
        callId: "call_1",
        toolName: "read_file",
        arguments: { path: "CONTEXT.md" }
      }
    ]);
  });

  it("replays assistant tool calls before tool results in the next request", async () => {
    let capturedBody: { messages: unknown[] } | undefined;
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async (_url, init) => {
        capturedBody = JSON.parse(String(init.body)) as { messages: unknown[] };
        return jsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "done" }
            }
          ]
        });
      }
    });

    await provider.sendTurn({
      systemPrompt: "sys",
      messages: [
        { role: "user", content: "read CONTEXT.md" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              callId: "call_1",
              toolName: "read_file",
              arguments: { path: "CONTEXT.md" }
            }
          ]
        },
        {
          role: "tool",
          callId: "call_1",
          toolName: "read_file",
          content: "# Context",
          ok: true
        }
      ],
      tools: []
    });

    expect(capturedBody?.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "read CONTEXT.md" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "read_file",
              arguments: JSON.stringify({ path: "CONTEXT.md" })
            }
          }
        ]
      },
      { role: "tool", tool_call_id: "call_1", content: "# Context" }
    ]);
  });

  it("sends Chat Completions shaped requests with auth, model, messages, and tools", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const transport: HttpTransport = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "ok" }
          }
        ]
      });
    };

    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "secret-key",
      baseUrl: "https://api.deepseek.com/",
      model: "deepseek-v4-pro",
      transport
    });

    await provider.sendTurn({
      systemPrompt: "sys",
      messages: [
        { role: "user", content: "hello" },
        {
          role: "tool",
          callId: "call_1",
          toolName: "read_file",
          content: "file body",
          ok: true
        }
      ],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          risk: "safe",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } }
          }
        }
      ]
    });

    expect(capturedUrl).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toMatchObject({
      authorization: "Bearer secret-key",
      "content-type": "application/json"
    });

    const body = JSON.parse(String(capturedInit?.body)) as {
      model: string;
      messages: unknown[];
      tools: unknown[];
    };
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "tool", tool_call_id: "call_1", content: "file body" }
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } }
          }
        }
      }
    ]);
  });

  it("throws a clear error on HTTP failure", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async () =>
        jsonResponse({ error: { message: "Invalid API key" } }, 401)
    });

    await expect(
      provider.sendTurn({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
        tools: []
      })
    ).rejects.toThrow(/HTTP 401.*Invalid API key/);
  });

  it("throws when tool call arguments are malformed JSON", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async () =>
        jsonResponse({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: "{not-json"
                    }
                  }
                ]
              }
            }
          ]
        })
    });

    await expect(
      provider.sendTurn({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
        tools: []
      })
    ).rejects.toThrow(/malformed tool arguments/);
  });

  it("throws when the model requests an unknown tool", async () => {
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      transport: async () =>
        jsonResponse({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "drop_database",
                      arguments: "{}"
                    }
                  }
                ]
              }
            }
          ]
        })
    });

    await expect(
      provider.sendTurn({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
        tools: []
      })
    ).rejects.toThrow(/unknown tool/);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
