# PRD: MCP Connectors (web search via Exa)

Status: ready-for-agent

## Problem Statement

As a learner using honey, the Harness can only call built-in Tools that operate on the local workspace. When I need current web facts (docs, release notes, APIs), I cannot get real search results through honey the way Cursor/Claude/Codex do. A first-party `web_search` Tool plus a separate search vendor key was considered and rejected in favor of Connectors over MCP (ADR-0008), but the runtime still has no MCP client, no mcp.json loading, and no way to merge Connector Tools into the Tool surface.

## Solution

Add a Harness-native MCP client that loads **Connectors** from Cursor-like mcp.json files, and when `--mcp` is set, discovers their tools and merges them into the same ToolRegistry surface as built-ins. v1 supports HTTP remote Connectors only (tools capability only). Ship an Exa example Connector (`https://mcp.exa.ai/mcp`) with an allowlist limited to `web_search_exa` so learners get real web search without a honey-owned search Tool or Plugin-bundled MCP. Behavior follows ADR-0008 and the project glossary (Connector vs Tool vs Plugin).

## User Stories

1. As a learner using honey, I want to enable MCP with an explicit `--mcp` flag, so that Connector Tools are opt-in and default Runs stay local-only.
2. As a learner, I want `--mcp` to be independent of `--allow-guarded-tools`, so that enabling web search via a Connector does not also unlock shell/patch Tools.
3. As a learner, when I do not pass `--mcp`, I want Connector Tools absent from the Provider tools list, so that the model cannot call capabilities that are not enabled.
4. As a learner, I want to configure Connectors in project `.honey/mcp.json`, so that a repo can share an Exa (or other) Connector setup.
5. As a learner, I want to configure Connectors in user `~/.honey/mcp.json`, so that my personal Connectors work across repos.
6. As a learner with both project and user mcp.json, I want same-named Connectors to prefer the project entry, so that repo policy wins over personal defaults.
7. As a learner opening `--mcp` with no usable mcp.json (missing or empty of HTTP Connectors), I want honey to fail at startup with a clear error, so that I know search/MCP was not silently skipped.
8. As a learner with multiple Connectors where one fails handshake or `tools/list`, I want that Connector skipped with a warning while others still load, so that one broken server does not kill the Session.
9. As a learner, I want v1 to accept HTTP remote Connector entries (`url` plus optional `headers`), so that I can point at hosted MCP such as Exa without running a local process.
10. As a learner whose mcp.json still contains stdio-style `command`/`args` entries, I want those entries ignored or clearly reported as unsupported in v1, so that I am not surprised by silent partial support.
11. As a learner, I want an example Exa Connector config that allowlists only `web_search_exa`, so that I get search-first behavior without immediately exposing `web_fetch_exa`.
12. As a learner, I want per-Connector tool allowlists in mcp.json, so that I control which discovered tools enter the Tool surface.
13. As a learner, when a Connector tool is not on the allowlist, I want it omitted from ToolRegistry, so that the model never sees disallowed tools.
14. As a learner (and as the model), I want Connector Tools to appear under their MCP original names (for example `web_search_exa`), so that schemas match what Exa and other agents document.
15. As a learner, I want Connector Tools merged into the same tools list as built-ins for each Turn, so that the model uses one calling convention.
16. As a learner, when the model invokes a Connector Tool, I want the Harness to dispatch through the same tool-result path as built-ins, so that Transcript, Session event log, and Compaction treat them uniformly.
17. As a learner running with `--mcp` and Exa configured (free tier or with API key headers), I want real web search results returned into the Turn, so that answers can cite current sources.
18. As a learner hitting Exa rate limits, I want the Tool result to surface a clear failure (for example 429 guidance to add an API key header), so that I can recover without guessing.
19. As a learner studying Compaction, I want Connector Tool results treated as refetchable like `search_workspace`, so that large SERP payloads can be cleared and re-queried under budget pressure.
20. As a learner using REPL mode, I want Connectors loaded for the Session when `--mcp` is set, so that successive Turns can keep calling Connector Tools without re-parsing flags.
21. As a learner using Command mode, I want the same `--mcp` + mcp.json behavior in one-shot Runs, so that demos and scripts work outside the Session TUI.
22. As a developer of honey, I want the closed built-in Tool name union opened enough to accept Connector-contributed names, so that Provider adapters do not reject valid MCP tool names.
23. As a developer of honey, I want Provider-side known-tool allowlists (if any) updated or removed so they do not block Connector names, so that OpenAI-compatible turns can round-trip MCP tool calls.
24. As a developer of honey, I want MCP HTTP traffic injectable via a transport seam (same idea as the OpenAI-compatible Provider), so that tests never depend on live Exa.
25. As a developer writing Harness tests, I want to supply an already-built tools list that includes a stub Connector Tool, so that merge/dispatch/Compaction behavior is assertable at the highest seam without a real MCP server.
26. As a developer writing MCP client unit tests, I want canned HTTP responses for initialize / tools/list / tools/call mapped into Tool definitions and execution results, so that protocol mapping is locked down.
27. As a developer writing config tests, I want fixture cwd/home trees with mcp.json files to assert merge, allowlists, and startup failure rules, so that Connector discovery stays deterministic.
28. As a developer writing CLI config tests, I want `--mcp` default-off and orthogonality to `--allow-guarded-tools` covered at the existing parse/runtime factory seam, so that flag plumbing does not regress.
29. As a maintainer, I want this work to follow ADR-0008 and leave Plugin install / Plugin-bundled MCP out of scope (ADR-0005), so that Connectors stay a Harness concern.
30. As a maintainer, I want glossary terms (Connector, Tool, Plugin, Harness, Run, Turn, Compaction) used consistently in docs and user-facing errors, so that “MCP server” is not reinvented as a product noun.
31. As a maintainer, I want README (and English twin if present) to document `--mcp`, mcp.json shape, and the Exa example, so that learners can enable web search without reading the ADR alone.
32. As a learner who later wants page fetch, I want to expand the Exa allowlist to include `web_fetch_exa` via config only, so that I do not need a honey code change for that expansion.
33. As a learner who adds a second HTTP Connector later, I want both Connectors’ allowlisted tools to coexist in ToolRegistry (with clear conflict behavior if names collide), so that the client stays multi-Connector.
34. As a developer, when two Connectors expose the same tool name, I want a defined precedence or rename/skip policy (document and test it), so that ToolRegistry keys remain unique.
35. As a learner inspecting Context inventory / dumps, I want Connector Tools visible in the tools offered to the Provider for that Turn when `--mcp` is on, so that observability matches the enabled surface.

## Implementation Decisions

- Respect ADR-0008 and ADR-0005: Harness-native MCP Connectors in scope; Plugin bundling of MCP remains out.
- Add a Connector config loader that reads project and user mcp.json (Cursor-like `mcpServers` object), merges with project-over-user for same names, and yields only v1-supported HTTP remote entries (`url`, optional `headers`, optional tool allowlist).
- Add an MCP HTTP client responsible for session initialize, `tools/list`, and `tools/call`, injectable through an HTTP transport abstraction parallel to the OpenAI-compatible Provider.
- Map each allowlisted MCP tool into a honey `Tool` (definition from MCP schema; `execute` delegates to `tools/call` on the owning Connector).
- Primary runtime seam: when building the tools list for `HarnessRuntime`, if MCP is enabled, append Connector-contributed Tools to the built-in default set before constructing ToolRegistry. Prefer extending the factory that currently returns only built-ins over changing `executeTool` control flow.
- Plumb a boolean MCP enable flag from CLI parse → CLI runtime config → Harness config, default false, orthogonal to `allowGuardedTools`.
- Open Tool naming so Connector names are first-class on Tool calls, Tool results, and Provider adapters; remove or widen any hard-coded built-in-only name sets that would reject MCP names.
- Compaction: include Connector tool names in the refetchable set (or equivalent policy keyed so allowlisted search tools clear like `search_workspace`). Prefer a design that does not require listing every future MCP name in a private constant if a “Connector-origin” mark is cleaner—but behavior must match ADR-0008.
- Startup policy: `--mcp` with zero usable Connectors after load → hard fail; individual Connector connect/list failure → warn + skip.
- Name collision policy (must be implemented and tested): if two Connectors contribute the same tool name, prefer the project-winning Connector’s tool already selected by config merge order; if still colliding across different server keys, skip the later tool and warn (do not silently overwrite).
- Example config and docs: document Exa at `https://mcp.exa.ai/mcp` with allowlist `["web_search_exa"]`; optional `headers` for API key; note free-tier without key and 429 recovery.
- Do not introduce a honey-owned Tool named `web_search`. Do not add Tavily/Exa REST as a built-in backend in this work.

## Testing Decisions

- Good tests assert external behavior at seams: enabled tool surface, dispatch results, config merge/fail rules, and Compaction of large Connector results—not MCP SDK private helpers or Exa availability.
- Highest seam: HarnessRuntime with an injected tools list including a stub Connector Tool — assert Provider-visible definitions, successful/failed execute path, Transcript tool messages, and Compaction under a low token budget.
- MCP HTTP client seam: unit tests with canned transport responses for initialize / tools/list / tools/call → Tool mapping and error surfacing (including HTTP error bodies).
- Config seam: temp cwd + fake home with mcp.json fixtures — merge precedence, allowlist filtering, unsupported stdio entries, `--mcp` with empty usable config → startup failure at the CLI runtime (or dedicated loader) boundary.
- CLI parse seam: existing CLI config tests — `--mcp` default off; on when flagged; orthogonal to `--allow-guarded-tools`.
- Optional process-level CLI test only for the hard-fail startup message when useful; not for protocol details.
- Prior art: CLI config + injected HTTP transport tests (OpenAI-compatible Provider); Harness tests with Scripted/Recording providers and low `tokenBudget` Compaction cases; Skills discovery tests using temp `.honey` trees.
- No live Exa calls in CI.

## Out of Scope

- Provider-hosted server tools (Claude/Codex built-in `web_search`).
- Honey-owned `web_search` Tool or Tavily/Exa REST WebSearchBackend.
- MCP resources and prompts.
- stdio MCP transport (`command` / `args`).
- Plugin install and Plugin-bundled Connectors.
- Session TUI-specific MCP UI beyond whatever falls out of the shared tools list.
- Dynamic filtering / code-execution search pipelines.
- OAuth flows for remote MCP (API key via headers only in v1).
- Changing Skill discovery or Project instructions loading.

## Further Notes

- Domain vocabulary: use **Connector** for the configured external tool provider; avoid calling the product concept “MCP server.” Tools contributed by Connectors are still **Tools** once merged.
- Grilling consensus archived in ADR-0008; this PRD is the implementation brief for that decision.
- Suggested test seams (confirmed with maintainer): (1) Harness tools-list construction as primary seam; (2) injectable MCP HTTP client; (3) mcp.json load from cwd/home; (4) CLI `--mcp` plumbing — without requiring real Exa E2E as a gate.
- First demo path after implementation: configure Exa allowlisted to `web_search_exa`, run `honey --mcp --provider deepseek "…"`, confirm the model can call the Connector Tool and receive live snippets.
