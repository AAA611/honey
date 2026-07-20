import { describe, expect, it } from "vitest";
import type { HttpTransport } from "../providers/openAiCompatibleProvider.js";
import { createConnectorTool, McpHttpClient } from "./mcpHttpClient.js";

describe("MCP HTTP client seam", () => {
  it("lists tools after initialize and maps tools/call text results", async () => {
    const calls: Array<{ method?: string; body: unknown }> = [];
    const transport = createScriptedTransport([
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "mcp-session-id": "sess-1"
        },
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "fake", version: "1" }
          }
        }
      },
      { status: 202, headers: {}, body: null },
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              {
                name: "web_search_exa",
                description: "Search the web",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" } },
                  required: ["query"]
                }
              },
              {
                name: "web_fetch_exa",
                description: "Fetch a page"
              }
            ]
          }
        }
      },
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 3,
          result: {
            content: [{ type: "text", text: "title: Example\nurl: https://ex.ample" }]
          }
        }
      }
    ], calls);

    const client = new McpHttpClient({
      url: "https://mcp.example/mcp",
      connectorName: "exa",
      transport
    });

    const tools = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "web_search_exa",
      "web_fetch_exa"
    ]);

    const tool = createConnectorTool(client, tools[0]!);
    expect(tool.definition.name).toBe("web_search_exa");
    expect(tool.definition.refetchable).toBe(true);

    const result = await tool.execute({ query: "React 19" }, { cwd: "/" });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("https://ex.ample");

    expect(calls[0]?.method).toBe("initialize");
    expect(calls.some((call) => call.method === "tools/list")).toBe(true);
    expect(calls.some((call) => call.method === "tools/call")).toBe(true);
    expect(
      calls.some(
        (call) =>
          typeof call.body === "object" &&
          call.body !== null &&
          "method" in call.body &&
          (call.body as { method?: string }).method === "notifications/initialized"
      )
    ).toBe(true);
  });

  it("surfaces HTTP 429 with API key guidance", async () => {
    const transport: HttpTransport = async () =>
      new Response("rate limit", { status: 429 });

    const client = new McpHttpClient({
      url: "https://mcp.exa.ai/mcp",
      connectorName: "exa",
      transport
    });

    await expect(client.listTools()).rejects.toThrow(/429/);
    await expect(client.listTools()).rejects.toThrow(/x-api-key/);
  });

  it("parses SSE JSON-RPC tool results", async () => {
    const transport = createScriptedTransport([
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "fake", version: "1" }
          }
        }
      },
      { status: 202, headers: {}, body: null },
      {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        bodyRaw:
          'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"web_search_exa"}]}}\n\n'
      }
    ]);

    const client = new McpHttpClient({
      url: "https://mcp.example/mcp",
      transport
    });
    const tools = await client.listTools();
    expect(tools).toEqual([{ name: "web_search_exa" }]);
  });
});

function createScriptedTransport(
  responses: Array<{
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    bodyRaw?: string;
  }>,
  calls: Array<{ method?: string; body: unknown }> = []
): HttpTransport {
  let index = 0;
  return async (_url, init) => {
    const rawBody = init.body ? String(init.body) : "";
    let parsed: unknown = rawBody;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // keep raw
    }
    const method =
      parsed && typeof parsed === "object" && parsed !== null && "method" in parsed
        ? String((parsed as { method: unknown }).method)
        : undefined;
    calls.push({ method, body: parsed });

    const next = responses[index++];
    if (!next) {
      throw new Error("Unexpected extra MCP HTTP call in test.");
    }

    if (next.bodyRaw !== undefined) {
      return new Response(next.bodyRaw, {
        status: next.status,
        headers: next.headers
      });
    }

    return new Response(
      next.body === null ? null : JSON.stringify(next.body),
      { status: next.status, headers: next.headers }
    );
  };
}
