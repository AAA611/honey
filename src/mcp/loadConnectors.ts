import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HttpConnectorConfig {
  name: string;
  url: string;
  scope: "user" | "project";
  headers?: Record<string, string>;
  /**
   * When present (including empty), only these MCP tool names are registered.
   * Omitted means allow all discovered tools.
   */
  tools?: string[];
}

export interface LoadConnectorsResult {
  connectors: HttpConnectorConfig[];
  /** Human-readable notes (unsupported stdio entries, etc.). */
  warnings: string[];
}

interface RawMcpServer {
  url?: unknown;
  headers?: unknown;
  tools?: unknown;
  command?: unknown;
  args?: unknown;
}

interface RawMcpFile {
  mcpServers?: Record<string, RawMcpServer>;
}

/**
 * Load HTTP Connectors from user then project mcp.json.
 * Same-named Connectors: project wins over user.
 */
export async function loadConnectors(options: {
  cwd: string;
  homeDir?: string;
}): Promise<LoadConnectorsResult> {
  const home = options.homeDir ?? homedir();
  const warnings: string[] = [];
  const byName = new Map<string, HttpConnectorConfig>();

  await mergeFile(join(home, ".honey", "mcp.json"), "user", byName, warnings);
  await mergeFile(
    join(options.cwd, ".honey", "mcp.json"),
    "project",
    byName,
    warnings
  );

  return {
    connectors: [...byName.values()],
    warnings
  };
}

async function mergeFile(
  path: string,
  scope: "user" | "project",
  byName: Map<string, HttpConnectorConfig>,
  warnings: string[]
): Promise<void> {
  let rawText: string;
  try {
    rawText = await readFile(path, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }

  let parsed: RawMcpFile;
  try {
    parsed = JSON.parse(rawText) as RawMcpFile;
  } catch {
    throw new Error(`Invalid JSON in Connector config ${path}.`);
  }

  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return;
  }

  for (const [name, entry] of Object.entries(servers)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (typeof entry.command === "string") {
      warnings.push(
        `Connector "${name}" in ${scope} mcp.json uses stdio (command/args), which is unsupported in v1; skipping.`
      );
      continue;
    }

    if (typeof entry.url !== "string" || entry.url.trim() === "") {
      warnings.push(
        `Connector "${name}" in ${scope} mcp.json has no HTTP url; skipping.`
      );
      continue;
    }

    const headers = normalizeHeaders(entry.headers);
    const tools = normalizeTools(entry.tools);

    byName.set(name, {
      name,
      url: entry.url.trim(),
      scope,
      ...(headers ? { headers } : {}),
      ...(tools !== undefined ? { tools } : {})
    });
  }
}

function normalizeHeaders(
  value: unknown
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") {
      headers[key] = headerValue;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeTools(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}
