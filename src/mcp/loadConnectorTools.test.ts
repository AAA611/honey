import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HttpTransport } from "../providers/openAiCompatibleProvider.js";
import { loadConnectorTools } from "./loadConnectorTools.js";
import { createRuntimeTools } from "./createRuntimeTools.js";

describe("loadConnectorTools seam", () => {
  it("applies allowlists, skips failed Connectors, and skips duplicate names", async () => {
    const home = await mkdtemp(join(tmpdir(), "honey-mcp-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "honey-mcp-cwd-"));
    await writeMcp(cwd, {
      mcpServers: {
        good: {
          url: "https://good.example/mcp",
          tools: ["web_search_exa"]
        },
        bad: { url: "https://bad.example/mcp" },
        dup: {
          url: "https://dup.example/mcp",
          tools: ["web_search_exa"]
        }
      }
    });

    const warnings: string[] = [];
    const transport = createMultiHostTransport({
      "https://good.example/mcp": scriptedOkTools([
        {
          name: "web_search_exa",
          description: "search"
        },
        { name: "web_fetch_exa", description: "fetch" }
      ]),
      "https://bad.example/mcp": async () => new Response("down", { status: 500 }),
      "https://dup.example/mcp": scriptedOkTools([
        { name: "web_search_exa", description: "dup search" }
      ])
    });

    const result = await loadConnectorTools({
      cwd,
      homeDir: home,
      transport,
      onWarning: (message) => warnings.push(message)
    });

    expect(result.tools.map((tool) => tool.definition.name)).toEqual([
      "web_search_exa"
    ]);
    expect(result.hadConfiguredConnectors).toBe(true);
    expect(warnings.some((w) => /Skipping Connector "bad"/.test(w))).toBe(true);
    expect(warnings.some((w) => /duplicate Connector tool/.test(w))).toBe(true);
  });

  it("fails createRuntimeTools when --mcp has no HTTP Connectors", async () => {
    const home = await mkdtemp(join(tmpdir(), "honey-mcp-empty-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "honey-mcp-empty-cwd-"));

    await expect(
      createRuntimeTools({ cwd, homeDir: home, mcp: true })
    ).rejects.toThrow(/no HTTP Connectors/);
  });

  it("merges Connector Tools into the default tool list when MCP is on", async () => {
    const home = await mkdtemp(join(tmpdir(), "honey-mcp-merge-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "honey-mcp-merge-cwd-"));
    await writeMcp(cwd, {
      mcpServers: {
        exa: {
          url: "https://mcp.exa.ai/mcp",
          tools: ["web_search_exa"]
        }
      }
    });

    const tools = await createRuntimeTools({
      cwd,
      homeDir: home,
      mcp: true,
      transport: scriptedOkTools([
        { name: "web_search_exa", description: "Search the web" }
      ])
    });

    const names = tools.map((tool) => tool.definition.name);
    expect(names).toContain("read_file");
    expect(names).toContain("web_search_exa");
  });
});

async function writeMcp(root: string, body: unknown): Promise<void> {
  const dir = join(root, ".honey");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp.json"), JSON.stringify(body, null, 2));
}

function scriptedOkTools(
  tools: Array<{ name: string; description?: string }>
): HttpTransport {
  let step = 0;
  return async (_url, init) => {
    const body = JSON.parse(String(init.body ?? "{}")) as { method?: string; id?: number };
    step += 1;
    if (body.method === "initialize") {
      return jsonRpc(body.id ?? 1, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fake", version: "1" }
      });
    }
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (body.method === "tools/list") {
      return jsonRpc(body.id ?? 2, { tools });
    }
    if (body.method === "tools/call") {
      return jsonRpc(body.id ?? 3, {
        content: [{ type: "text", text: "ok" }]
      });
    }
    throw new Error(`Unexpected method ${body.method} at step ${step}`);
  };
}

function createMultiHostTransport(
  byUrl: Record<string, HttpTransport>
): HttpTransport {
  return async (url, init) => {
    const transport = byUrl[url];
    if (!transport) {
      throw new Error(`No scripted transport for ${url}`);
    }
    return transport(url, init);
  };
}

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
