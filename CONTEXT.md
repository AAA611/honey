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
- **Root set**: the Compaction-proof layers re-injected every Turn: System, Project instructions, Task, Summary, Plan, Environment, and Pinned artifacts.
  _Avoid_: full Assembled prompt, Working set
- **Session**: one interactive terminal conversation started by launching `honey`, preserving Transcript, context layers, Plan, and event continuity until the user exits.
- **Session event log**: the Session-scoped durable append-only record of structured HarnessEvents persisted for inspection and replay; distinct from Transcript and from optional Assembled prompt dumps.
  _Avoid_: chat log, conversation dump, prompt dump (as the name of this artifact)
- **Context inventory**: the Session-visible breakdown of Assembled prompt layers, token estimates, Compaction status, and Root set membership; may also be persisted per Turn as a structural snapshot for later inspection.
  _Avoid_: raw prompt dump as the only observability surface
- **REPL mode**: the interactive terminal mode entered by running `honey` with no prompt argument, using single-line input and repeated turns.
- **Command mode**: the one-shot CLI mode entered by running `honey "<prompt>"`, executing a single request and exiting.
- **Bin entrypoint**: the packaged executable command exposed as `honey` through npm's `bin` field.
- **Session banner**: the branded welcome surface of a Session (ASCII wordmark plus a short usage line), shown on Session entry and after `clear`, and never in Command mode.
  _Avoid_: splash screen, startup logo, welcome message

This glossary is intentionally small and should grow only when a term becomes stable and necessary.
