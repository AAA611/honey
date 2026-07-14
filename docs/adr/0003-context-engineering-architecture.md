# ADR-0003: Context Engineering Architecture

## Status

Accepted

## Context

Honey's current context path is demo-grade: a fixed message-count working set, string-truncation "summaries," and a Provider path that still receives the full conversation transcript. Layer fields exist mainly for logging. The project needs a real context-engineering shape to study Claude Code / Codex style problems without cloning their full production cascades.

## Decision

Honey will treat context as **Harness-owned assembly**, not chat-history passthrough.

1. **Assembled prompt is the only Provider input.** The Session keeps a durable **Transcript** for continuity and inspection; it is never sent to the Provider as-is.
2. **Layers.** The Assembled prompt is composed from: System, Project instructions, Task, Plan, Environment, Summary, Working set, and Pinned artifacts.
3. **Task ≠ Plan.** Task is the current goal and acceptance framing. Plan is the step checklist with statuses.
4. **Compaction (two-stage, not full cascade).** Under a token budget, first clear or shrink re-fetchable tool results; if still over budget, compress older history into Summary. Honey will not adopt Claude Code's full cascade (snip / session-memory / fork summarizer / reactive tiers) in this architecture decision. Summary writers start deterministic and may later use a model Turn under the same contract.
5. **Budget metering.** Local token heuristics are required on the hot path; Provider-exact counting is optional calibration only.
6. **Root set.** After Compaction, these are re-injected every Turn: System, Project instructions, Task, Summary, Plan, Environment, and Pinned artifacts. Working set is not part of the Root set.
7. **Pinned artifacts.** Dual-channel in contract (Harness policy and later explicit model pin/unpin), always quota-bounded. First implementation is Harness-automatic pin only.
8. **Project instructions.** Read-only repo guidance loaded at Session start (for example `AGENTS.md` / `CONTEXT.md`). This is not a writable long-term memory system and stays within the spirit of existing out-of-scope limits.
9. **REPL Task continuity.** Soft-continue by default; users can force a hard switch; automatic replace only on high-confidence signals (for example completed Plan plus a clearly new goal).
10. **Observability.** A Context inventory command surfaces layer token estimates and Compaction status; each Turn may also persist a structural Assembled prompt snapshot for later inspection.

## Considered Options

- **Transcript passthrough with decorative layers** — rejected; makes Working set / Summary non-operational.
- **Full Claude Code compaction cascade** — rejected for scope; the learning value is owned budget + tool-result clearing + Summary, not reimplementing every production tier.
- **Message-count-only trimming** — rejected as the primary pressure signal; it does not teach context rot under token budgets.
- **Writable long-term memory** — rejected; conflicts with the v0 out-of-scope boundary. Read-only Project instructions are the allowed substitute for stable cross-compaction guidance.

## Consequences

### Positive

- Provider, Transcript, and governance become separable seams that can be tested independently.
- Compaction has an explicit survival story (Root set) so pressure relief does not silently erase goals, plans, or pinned excerpts.
- Educational observability (`Context inventory` + snapshots) makes assembly inspectable.

### Negative

- More moving parts than the current `layers.ts` demo; implementation must be phased (assembly → budget → tool clearing → deterministic Summary → inventory → later model Summary / model pin).
- Soft-continue heuristics can misclassify Task boundaries; user-forced switch remains the safety valve.

## Follow-up

- Stop sending `conversation` wholesale in `HarnessSession`; assemble Provider messages from layers.
- Replace `MAX_WORKING_SET` message counting with token-budget Compaction.
- Wire Task (acceptance framing) separately from Plan steps; stop using the dead `"Interactive session"` task string as a stand-in.
- Add Context inventory + per-Turn structural snapshots.
- Optionally record a later ADR if Summary writer or Pinned dual-channel promotion changes the contract.
