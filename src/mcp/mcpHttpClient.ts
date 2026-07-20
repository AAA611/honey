import type { HttpTransport } from "../providers/openAiCompatibleProvider.js";
import type { Tool, ToolExecutionResult } from "../types.js";

const PROTOCOL_VERSION = "2025-03-26";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpHttpClientOptions {
  url: string;
  headers?: Record<string, string>;
  transport?: HttpTransport;
  /** Connector name for error messages. */
  connectorName?: string;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
}

/**
 * Minimal Streamable HTTP MCP client (tools only).
 */
export class McpHttpClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly transport: HttpTransport;
  private readonly connectorName: string;
  private nextId = 1;
  private sessionId: string | undefined;
  private initialized = false;

  constructor(options: McpHttpClientOptions) {
    this.url = options.url;
    this.headers = { ...(options.headers ?? {}) };
    this.transport = options.transport ?? fetch;
    this.connectorName = options.connectorName ?? options.url;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.ensureInitialized();
    const result = (await this.request("tools/list", {})) as {
      tools?: McpToolDescriptor[];
    };
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    await this.ensureInitialized();
    try {
      const result = (await this.request("tools/call", {
        name,
        arguments: args
      })) as {
        content?: Array<{ type?: string; text?: string }>;
        isError?: boolean;
      };

      const text = (result.content ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n");

      if (result.isError) {
        return {
          ok: false,
          content: text || `Connector tool "${name}" returned an error.`
        };
      }

      return {
        ok: true,
        content: text || "(empty Connector tool result)"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, content: message };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "honey", version: "0.1.0" }
    });

    await this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  private async request(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const response = await this.post(body);
    this.captureSessionId(response);
    await this.assertHttpOk(response, method);

    if (response.status === 202) {
      return {};
    }

    const payload = await readJsonRpcPayload(response);
    if (payload.error) {
      throw new Error(
        `Connector "${this.connectorName}" ${method} error: ${payload.error.message ?? "unknown"}`
      );
    }
    return payload.result ?? {};
  }

  private async notify(
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const body = {
      jsonrpc: "2.0" as const,
      method,
      params
    };
    const response = await this.post(body);
    this.captureSessionId(response);
    await this.assertHttpOk(response, method);
  }

  private captureSessionId(response: Response): void {
    const sessionHeader =
      response.headers.get("mcp-session-id") ??
      response.headers.get("Mcp-Session-Id");
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }
  }

  private async assertHttpOk(response: Response, method: string): Promise<void> {
    if (response.status === 429) {
      throw new Error(
        `Connector "${this.connectorName}" rate-limited (HTTP 429). Add an API key via mcp.json headers (for Exa: x-api-key) and retry.`
      );
    }
    if (!response.ok && response.status !== 202) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Connector "${this.connectorName}" ${method} failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 400)}` : "."}`
      );
    }
  }

  private async post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...this.headers
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    return this.transport(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  }
}

export function createConnectorTool(
  client: McpHttpClient,
  descriptor: McpToolDescriptor
): Tool {
  return {
    definition: {
      name: descriptor.name,
      description: descriptor.description ?? `Connector tool ${descriptor.name}`,
      risk: "safe",
      refetchable: true,
      inputSchema: descriptor.inputSchema ?? {
        type: "object",
        properties: {}
      }
    },
    execute(input) {
      return client.callTool(descriptor.name, input);
    }
  };
}

async function readJsonRpcPayload(response: Response): Promise<JsonRpcResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (let i = dataLines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(dataLines[i]!) as JsonRpcResponse;
        if (parsed && (parsed.result !== undefined || parsed.error)) {
          return parsed;
        }
      } catch {
        // keep scanning
      }
    }
    throw new Error("MCP SSE response did not include a JSON-RPC result.");
  }

  return (await response.json()) as JsonRpcResponse;
}
