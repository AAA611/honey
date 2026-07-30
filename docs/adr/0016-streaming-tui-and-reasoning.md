# ADR-0016: Streaming Session TUI and Reasoning

ADR-0002 deferred streaming so the first OpenAI-compatible Provider could stay on `sendTurn → ProviderTurnResponse`. We now want mid-Turn visible answer text and model **Reasoning** in the Session TUI. We add a streaming Provider path and keep Reasoning out of Assembled prompt layers.

## Decision

- **Provider:** Add `streamTurn` (deltas) alongside existing `sendTurn`. OpenAI-compatible adapters use `stream: true` + SSE; Scripted / tests may keep `sendTurn` only. Harness prefers `streamTurn` when present, else falls back to `sendTurn`.
- **Delta kinds (v1):** Stream assistant answer text and Reasoning when the Provider emits it. Tool-call argument incremental assembly waits until the stream completes.
- **Surfaces:** Mid-Turn Draft assistant and Reasoning UX only in Session TUI. Line REPL and Command mode still show completed output. Subagent runs do not stream into the parent TUI (parent still sees Subagent result only).
- **Draft assistant:** TUI preview only; commit to Transcript / Working set when that model call finishes. In a tool loop, every model call streams.
- **Reasoning:** Parallel Session state for inspection; never Working set / Assembled prompt. Harness does not invent Reasoning when the Provider omits it.
- **Busy spinner:** Keep `thinking…` until the Turn finishes, even while Draft / Reasoning text is already visible.
- **Session event log:** Record final assistant content and final Reasoning (when present); do not log per-delta events.
- **Cancel:** No mid-stream cancel in this cut.

This supersedes ADR-0002’s “v1 is non-streaming” constraint only. Other ADR-0002 decisions (OpenAI-compatible wire shape, presets, credential env, guarded-tools default) stand.

## Considered Options

- **Unify on a single streaming-only `sendTurn`** — rejected; would force every Scripted/mock Provider to change shape at once.
- **TUI typewriter over a finished blob** — rejected; not real streaming and cannot show live Reasoning.
- **Put Reasoning into Transcript message roles / Working set** — rejected; breaks Assembled-prompt boundaries and Compaction.
- **Stream tool-call argument deltas in v1** — deferred; higher complexity than the UX goal.
- **Stream in line REPL / Command mode / parent-nested Subagent** — deferred; Session TUI is the teaching surface for this cut.
- **Mid-stream cancel (Esc / AbortSignal)** — deferred; separate product cut.

## Consequences

- Gap tests that expect `stream: true` and mid-Turn Draft assistant become the load-bearing feedback loop; ADR-0002’s `stream: false` assertion flips when this ships.
- Future tool-call streaming, cancel, or Subagent nested streaming should supersede parts of this ADR deliberately.
