import type { HttpTransport } from "../providers/openAiCompatibleProvider.js";
import type { Tool } from "../types.js";
import { createDefaultTools } from "../tools/defaultTools.js";
import { loadConnectorTools } from "./loadConnectorTools.js";

export interface CreateRuntimeToolsOptions {
  cwd: string;
  mcp: boolean;
  homeDir?: string;
  transport?: HttpTransport;
  onWarning?: (message: string) => void;
}

/**
 * Built-in Tools, plus Connector Tools when MCP is enabled.
 * Throws when `--mcp` is set but no usable HTTP Connectors are configured.
 */
export async function createRuntimeTools(
  options: CreateRuntimeToolsOptions
): Promise<Tool[]> {
  const builtIn = createDefaultTools();
  if (!options.mcp) {
    return builtIn;
  }

  const loaded = await loadConnectorTools({
    cwd: options.cwd,
    homeDir: options.homeDir,
    transport: options.transport,
    onWarning: options.onWarning
  });

  if (!loaded.hadConfiguredConnectors) {
    throw new Error(
      "MCP is enabled (--mcp) but no HTTP Connectors were found. Add .honey/mcp.json or ~/.honey/mcp.json with an mcpServers entry that has a url (see docs for the Exa example)."
    );
  }

  if (loaded.tools.length === 0) {
    throw new Error(
      "MCP is enabled (--mcp) but no Connector Tools were loaded. Check Connector URLs, allowlists, and warnings above."
    );
  }

  const builtInNames = new Set(builtIn.map((tool) => tool.definition.name));
  const connectorTools: Tool[] = [];
  for (const tool of loaded.tools) {
    if (builtInNames.has(tool.definition.name)) {
      const message = `Skipping Connector tool "${tool.definition.name}" because it collides with a built-in Tool.`;
      options.onWarning?.(message);
      continue;
    }
    connectorTools.push(tool);
  }

  if (connectorTools.length === 0) {
    throw new Error(
      "MCP is enabled (--mcp) but no Connector Tools were loaded after collision checks. Check allowlists and warnings above."
    );
  }

  return [...builtIn, ...connectorTools];
}
