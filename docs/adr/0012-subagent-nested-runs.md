# ADR-0012: Subagent as nested Run via `spawn_subagent`

Honey is a teaching Harness for coding-agent runtimes. Learners need a first-class seam for “parent delegates an isolated child,” not role-prompt switching and not a second Session. We add **Subagent**: a nested Run in the same Session, started by the guarded Tool `spawn_subagent`.

## Decision

- **Shape:** Subagent = nested Run (own Task / Working set / Assembled prompt), same Session (shared event log, cwd, Approval surface, Project instructions / Environment / Skill catalog inheritance).
- **Isolation:** Do not copy the parent Transcript or Working set. The only parent→child input is the spawn `prompt` (delegation bag).
- **Trigger:** Model-driven Tool `spawn_subagent` (not slash-only, not Plan-as-orchestrator). Name avoids colliding with domain **Task**.
- **Depth:** Fixed at 1 — child Tool surface omits `spawn_subagent`.
- **Return:** Structured **Subagent result** (`summary` / `status` / `run_id`, capped summary), not the child Transcript. Parent Transcript stays minimal; nested detail is in the Session event log (`run_id` + `parent_run_id`).
- **Approval:** `spawn_subagent` is guarded; child guarded Tools reuse the same Session Approval callback / `--allow-guarded-tools` bypass (inherit parent policy, Codex/Claude-style).
- **Parallelism:** Target is compute-parallel with a single Approval queue; v1 ships serial single-spawn only so the isolation seam is learnable before scheduling complexity.

## Considered Options

- **Role relay in one Assembled prompt** — rejected; teaches prompt switching, not context isolation.
- **New Session per Subagent** — rejected for v1; duplicates Session/TUI/Approval lifecycle without teaching the nested-Run seam.
- **Name the Tool `task`** — rejected; conflicts with existing **Task** (goal / acceptance framing).
- **Shared parent Working set / full Transcript return** — rejected; collapses isolation and blows the parent context window.
- **Child auto-allow for guarded Tools** — rejected; diverges from mainstream inherit-parent-policy and weakens the Approval lesson.
- **Parallel fan-out in v1** — deferred; Approval is inherently a human serial queue and multi-run event interleaving is a second learning cut.

## Consequences

- README’s “no multi-agent orchestration” claim is narrowed: v1 Subagent is nested Run delegation, not a DAG orchestrator.
- `EventType` gains Subagent lifecycle entries; `HarnessEvent` may carry `parentRunId` for nested correlation.
- Future parallel spawn can reuse the same Subagent / Subagent result contracts without redesigning isolation.
