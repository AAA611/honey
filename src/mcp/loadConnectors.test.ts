import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConnectors } from "./loadConnectors.js";

const dirs: string[] = [];

afterEach(async () => {
  // Best-effort cleanup is unnecessary for tmp; keep list for clarity.
  dirs.length = 0;
});

describe("Connector config seam", () => {
  it("merges project over user for same-named Connectors", async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    await writeMcp(home, {
      mcpServers: {
        exa: {
          url: "https://user.example/mcp",
          tools: ["web_search_exa"]
        },
        other: { url: "https://other.example/mcp" }
      }
    });
    await writeMcp(cwd, {
      mcpServers: {
        exa: {
          url: "https://project.example/mcp",
          tools: ["web_search_exa"],
          headers: { "x-api-key": "proj" }
        }
      }
    });

    const result = await loadConnectors({ cwd, homeDir: home });
    expect(result.connectors).toEqual([
      {
        name: "exa",
        url: "https://project.example/mcp",
        scope: "project",
        tools: ["web_search_exa"],
        headers: { "x-api-key": "proj" }
      },
      {
        name: "other",
        url: "https://other.example/mcp",
        scope: "user"
      }
    ]);
  });

  it("treats an empty tools allowlist as allow-none", async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    await writeMcp(cwd, {
      mcpServers: {
        exa: { url: "https://project.example/mcp", tools: [] }
      }
    });
    const result = await loadConnectors({ cwd, homeDir: home });
    expect(result.connectors[0]?.tools).toEqual([]);
  });

  it("skips stdio Connectors with a warning", async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    await writeMcp(cwd, {
      mcpServers: {
        local: { command: "npx", args: ["-y", "some-mcp"] },
        remote: { url: "https://remote.example/mcp" }
      }
    });

    const result = await loadConnectors({ cwd, homeDir: home });
    expect(result.connectors).toEqual([
      { name: "remote", url: "https://remote.example/mcp", scope: "project" }
    ]);
    expect(result.warnings.some((w) => /stdio/.test(w))).toBe(true);
  });

  it("returns empty when no mcp.json exists", async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    const result = await loadConnectors({ cwd, homeDir: home });
    expect(result.connectors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "honey-mcp-"));
  dirs.push(dir);
  return dir;
}

async function writeMcp(
  root: string,
  body: unknown
): Promise<void> {
  const dir = join(root, ".honey");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp.json"), JSON.stringify(body, null, 2));
}
