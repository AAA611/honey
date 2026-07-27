# Context

This repository contains a local CLI harness project for learning how Claude Code or Codex style agent runtimes are built.

## Current domain vocabulary

- **Harness**: the runtime layer that coordinates model turns, tools, state transitions, context, policy, and outputs.
- **Provider**: the model backend adapter responsible for normalizing model I/O into runtime-owned structures.
- **Tool**: a runtime-exposed capability the model may invoke through structured calls.
- **Run**: one end-to-end execution of the harness for a user task.
- **Turn**: one model interaction cycle inside a run, including any tool calls and results.
- **Plan**: the explicit lightweight step breakdown maintained by the runtime (ordered steps with statuses); injected into the Assembled prompt as progress state, not as the acceptance framing itself.
- **Task**: the current user goal and acceptance framing for the active request; distinct from Plan. In REPL mode a new user input may continue the current Task or replace it; continuation vs replacement is an explicit Harness decision, not an accidental append.
  _Avoid_: Plan.goal as a substitute for acceptance framing; session-long mission statement; silently stacking unrelated goals into one Task
- **Assembled prompt**: the sole Provider-facing context for a Turn, composed by the Harness from ordered layers rather than from the raw Transcript.
  _Avoid_: full conversation dump, chat history passthrough
- **Transcript**: the durable turn-by-turn message log kept by the Session for continuity and inspection; never sent to the Provider as-is.
  _Avoid_: conversation (when meaning the Provider payload), chat history
- **Environment**: session-scoped facts about the execution setting (for example cwd, platform, or policy summary) injected into the Assembled prompt.
- **Project instructions**: read-only repository guidance loaded at Session start (for example `AGENTS.md` or `CONTEXT.md`) and re-injected as part of the Root set; not a writable long-term memory system.
  _Avoid_: long-term memory, auto-memory, CLAUDE.md clone as a product feature name
- **Pinned artifact**: an excerpt or instruction fragment retained across Turns and re-injected after Compaction, outside ordinary Working set rotation. It may be established by Harness policy or by an explicit model request, always under Harness quotas.
  _Avoid_: attachment (unless referring to a product-specific injection mechanism), RAG hit
- **Working set**: the recent dialogue and tool I/O layer inside the Assembled prompt for the current Turn.
  _Avoid_: entire Assembled prompt, full Transcript
- **Summary**: compressed prior context retained after history pressure relief, replacing older Transcript material rather than duplicating it. Early writers may be deterministic; later writers may use a model Turn under the same Summary contract.
- **Compaction**: the Harness-owned pressure relief for the Assembled prompt: first clear or shrink re-fetchable tool results under a token budget, then compress older history into Summary when still over budget. Budget checks use a required local token heuristic and may optionally calibrate with Provider-exact counting when available.
  _Avoid_: truncation-only trimming, message-count-only triggers, full Claude Code compaction cascade, provider passthrough history management
- **Root set**: the Compaction-proof layers re-injected every Turn: System, Project instructions, Task, Summary, Plan, Environment, Skill catalog, and Pinned artifacts.
  _Avoid_: full Assembled prompt, Working set, Skill body (loaded via tools into the Working set when used)
- **Session**: one interactive terminal conversation started by launching `honey`, preserving Transcript, context layers, Plan, and event continuity until the user exits.
- **Session event log**: the Session-scoped durable append-only record of structured HarnessEvents persisted for inspection and replay; distinct from Transcript and from optional Assembled prompt dumps.
  _Avoid_: chat log, conversation dump, prompt dump (as the name of this artifact)
- **Context inventory**: the Session-visible breakdown of Assembled prompt layers, token estimates, Compaction status, and Root set membership; may also be persisted per Turn as a structural snapshot for later inspection.
  _Avoid_: raw prompt dump as the only observability surface
- **REPL mode**: the interactive terminal mode entered by running `honey` with no prompt argument, using single-line input and repeated turns.
- **Command mode**: the one-shot CLI mode entered by running `honey "<prompt>"`, executing a single request and exiting.
- **Bin entrypoint**: the packaged executable command exposed as `honey` through npm's `bin` field.
- **Session banner**: the branded welcome surface of a Session (ASCII wordmark plus a short usage line), shown on Session entry and after `clear` in line REPL, and at the top of the Session TUI; never in Command mode.
  _Avoid_: splash screen, startup logo, welcome message
- **Skill**: a reusable task-specific package (instructions plus optional scripts or references) that the Harness may activate for a Task; distinct from Tool (callable capability) and from Project instructions (always-on repo guidance).
  _Avoid_: Tool, Project instructions, prompt template, system prompt fragment (as the name of this package)
- **Skill catalog**: the compact discovery index of available Skills (name, description, path, and optional resource pointers) injected each Turn so the model can see what exists without loading Skill bodies.
  _Avoid_: full Skill body dump, Project instructions
- **Skill picker**: the interactive surface for choosing a Skill (and in the Session TUI, also built-in slash commands). On a TTY this is the `/` overlay in the Session TUI; on non-TTY it lists Skills and directs the user to type `$name`.
  _Avoid_: Skill catalog, full plugin marketplace UI
- **Session TUI**: the Ink-based REPL shell that shows Session banner, Transcript, Status, Composer, and the slash Overlay together; distinct from Command mode and from non-TTY line input.
  _Avoid_: Harness UI, web UI
- **Composer**: the Session TUI keystroke-level input box where the user edits the next message and triggers `/` filtering.
  _Avoid_: readline prompt, chat input (as a product name)
- **Skill scope**: the discovery origin of a Skill — repo, user, or bundled — used for precedence when discovering Skills.
  _Avoid_: Plugin scope, Tool risk (as a substitute name for origin); script-approval policy (guarded Skill scripts use Harness Approval)
- **Plugin**: an installable distribution unit that packages one or more Skills (and later may bundle Connectors); not itself a layer in the Assembled prompt.
  _Avoid_: Skill, Tool, Connector (as the runtime configuration surface — that is mcp.json / Harness MCP client)
- **Connector**: a configured external tool provider that contributes Tools to the Harness over MCP (for example an HTTP MCP server entry in mcp.json); discovered Tools merge into the same Tool surface as built-in Tools when MCP is enabled for the Run.
  _Avoid_: MCP server (as the product name for this concept), Plugin, built-in Tool, web_search (as a honey-owned Tool name — web search arrives as Connector-contributed Tools such as Exa's `web_search_exa`)
- **Approval**: the Harness-owned pause before executing a guarded Tool call, where the user allows or denies that specific call and the Turn then continues with the result. Scope v1: per-call interactive gate for all guarded Tools via one Harness callback (absorbs the former user Skill-script `confirmSkillScript` special case). Surfaces: Session TUI and line REPL; Command mode stays non-interactive and relies on `--allow-guarded-tools` bypass. When that flag is set, guarded Tools auto-allow and skip Approval. Deny is soft: return a failed Tool result and let the Turn continue (do not abort the Run). The Approval prompt shows the Tool name plus a truncated argument summary (not a full diff/review UI). Approval decisions are first-class Session event log entries (distinct from ordinary `tool_result`), so the pause-and-decide moment is visible on the Session timeline. When a model response contains multiple guarded Tool calls, Approval is sequential: ask and resolve each call in dispatch order before moving to the next.
  _Avoid_: advanced approval workflow, allowlist product; do not conflate Approval with the `--allow-guarded-tools` bypass flag; do not keep a parallel confirmSkillScript path; hard-stop on deny; full-diff Approval UX; folding Approval solely into `tool_result` with no dedicated events; batch-first or fail-fast-batch Approval UI
- **Workspace bound**: the Harness-enforced rule that path-taking Tool I/O must resolve under the Session `cwd` (the Environment cwd — not a separately discovered repo root). Bound checks use the real path after symlink resolution, not lexical `resolve` alone. Escape attempts fail without performing the I/O and are recorded as dedicated Session event log entries (distinct from Approval events and from ordinary `tool_result` alone). Applies to path-taking Tools regardless of ToolRisk; runs before Approval for guarded path Tools. Default on; may be disabled only via an explicit `--no-workspace-bound` style escape hatch that is orthogonal to `--allow-guarded-tools`. Distinct from Approval and from OS sandbox / command allowlists.
  _Avoid_: sandbox, jail, workspace root as an entity separate from cwd; lexical-only path prefix checks; folding Bound into Approval or into `--allow-guarded-tools`; implying shell/`exec_command` is confined by Workspace bound alone

This glossary is intentionally small and should grow only when a term becomes stable and necessary.
