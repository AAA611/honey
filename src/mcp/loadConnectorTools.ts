import type { HttpTransport } from "../providers/openAiCompatibleProvider.js";
import type { Tool } from "../types.js";
import {
  loadConnectors,
  type HttpConnectorConfig
} from "./loadConnectors.js";
import { createConnectorTool, McpHttpClient } from "./mcpHttpClient.js";

export interface LoadConnectorToolsOptions {
  cwd: string;
  homeDir?: string;
  transport?: HttpTransport;
  /** Collect warnings (skipped Connectors, collisions, stdio). */
  onWarning?: (message: string) => void;
}

export interface LoadConnectorToolsResult {
  tools: Tool[];
  warnings: string[];
  /** True when at least one HTTP Connector was configured. */
  hadConfiguredConnectors: boolean;
}

/**
 * Discover Connector Tools for enabled MCP: load mcp.json, connect each
 * HTTP Connector, apply allowlists, skip failures/collisions with warnings.
 */
export async function loadConnectorTools(
  options: LoadConnectorToolsOptions
): Promise<LoadConnectorToolsResult> {
  const loaded = await loadConnectors({
    cwd: options.cwd,
    homeDir: options.homeDir
  });
  const warnings: string[] = [];
  const emit = (message: string) => {
    warnings.push(message);
    options.onWarning?.(message);
  };
  for (const warning of loaded.warnings) {
    emit(warning);
  }

  if (loaded.connectors.length === 0) {
    return {
      tools: [],
      warnings,
      hadConfiguredConnectors: false
    };
  }

  const tools: Tool[] = [];
  const seenNames = new Set<string>();

  // Project Connectors first so their tools win collisions over user Connectors.
  const ordered = [...loaded.connectors].sort((a, b) => {
    if (a.scope === b.scope) {
      return 0;
    }
    return a.scope === "project" ? -1 : 1;
  });

  for (const connector of ordered) {
    const contributed = await loadOneConnector(connector, options.transport, emit);
    for (const tool of contributed) {
      if (seenNames.has(tool.definition.name)) {
        emit(
          `Skipping duplicate Connector tool "${tool.definition.name}" from "${connector.name}" (already registered).`
        );
        continue;
      }
      seenNames.add(tool.definition.name);
      tools.push(tool);
    }
  }

  return {
    tools,
    warnings,
    hadConfiguredConnectors: true
  };
}

async function loadOneConnector(
  connector: HttpConnectorConfig,
  transport: HttpTransport | undefined,
  emit: (message: string) => void
): Promise<Tool[]> {
  const client = new McpHttpClient({
    url: connector.url,
    headers: connector.headers,
    transport,
    connectorName: connector.name
  });

  let descriptors;
  try {
    descriptors = await client.listTools();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(`Skipping Connector "${connector.name}": ${message}`);
    return [];
  }

  const allow = connector.tools ? new Set(connector.tools) : null;
  const tools: Tool[] = [];
  for (const descriptor of descriptors) {
    if (allow && !allow.has(descriptor.name)) {
      continue;
    }
    tools.push(createConnectorTool(client, descriptor));
  }
  return tools;
}
