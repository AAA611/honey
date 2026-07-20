# ADR-0008: MCP Connectors for external tools (web search via Exa)

Honey needs real web search without owning a search backend or a first-party `web_search` Tool. We will add a **Harness-native MCP client** that loads **Connectors** from mcp.json, merges discovered tools into `ToolRegistry`, and use Exa's hosted MCP (`https://mcp.exa.ai/mcp`) as the first Connector — not a Tavily-backed built-in Tool, and not Plugin-bundled MCP.

## Decision

- **Connector config**: project `.honey/mcp.json` and user `~/.honey/mcp.json` (Cursor-like `mcpServers` shape). Same-name servers: repo wins over user.
- **Enablement**: MCP is off unless `--mcp` (orthogonal to `--allow-guarded-tools`). When disabled, Connector tools are not registered.
- **Tool surface**: discovered MCP tools merge into `ToolRegistry` under their original names; the closed `ToolName` union opens to allow Connector-contributed names. Optional per-server tool allowlist (Exa example: only `web_search_exa`).
- **Transport (v1)**: HTTP remote only (`url` + optional `headers`). stdio `command`/`args` deferred.
- **Capabilities (v1)**: tools only — no MCP resources/prompts.
- **Failure policy**: `--mcp` with no usable config → startup failure; one Connector failing handshake/`tools/list` → skip that server with a warning, continue with others.
- **Compaction**: Connector tool results are treated as refetchable (clearable under budget; re-invoke if needed), like `search_workspace`.
- **Name collision policy**: same-named Connector configs prefer project over user; when different Connectors expose the same tool name, keep the first registered (project Connectors load before user) and warn+skip later ones; collisions with built-in Tool names skip the Connector tool and warn.
- **Out of scope for this ADR**: Provider-hosted server tools (Claude/Codex `web_search`), a honey-owned `web_search` + Tavily REST Tool, full MCP (resources/prompts/stdio), and Plugin install that bundles Connectors (still ADR-0005).

This revises ADR-0005 only on the point that **Harness MCP is now in scope**; **Plugin + MCP bundling** remains out of scope.

## Considered Options

- **Built-in `web_search` Tool + Tavily/Exa REST** — good for learning local Tool I/O, but forces a separate search API key and diverges from how Cursor/Claude expose hosted or MCP search. Rejected for the web-search goal after choosing Connector/MCP.
- **Exa-only hard-coded client** — ships search faster, teaches no MCP boundary. Rejected.
- **Full MCP in one step** — resources, prompts, stdio, and Plugin bundling together. Rejected as too wide for the learning harness.
- **Proxy Tool `call_mcp_tool`** — single meta-tool instead of flattening. Rejected; models and other agents expect per-tool schemas in the tools list.
