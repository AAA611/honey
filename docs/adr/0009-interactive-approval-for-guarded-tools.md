# ADR-0009: Interactive Approval for Guarded Tools

Honey already classifies Tools as `safe` / `guarded` / `blocked` and gates guarded execution with `--allow-guarded-tools`, plus a separate `confirmSkillScript` path for user-scoped Skill scripts. Learners cannot see a first-class Harness pause-and-decide loop. We will add **Approval**: one Harness-owned interactive gate before each guarded Tool call, while keeping the flag as an explicit bypass.

## Decision

- Scope v1 is per-call Approval for guarded Tools only — no session/permanent memory and no separate policy-engine product.
- `--allow-guarded-tools` remains a Keep-as-bypass: when set, guarded Tools auto-allow and skip Approval (evals, scripts, Command mode).
- Surfaces: Session TUI and line REPL wire the Approval callback; Command mode stays non-interactive and relies on the bypass flag (or Soft-deny if neither host nor flag is present).
- Unify: all guarded Tools — including `run_skill_script` — use one Harness Approval callback. This absorbs and retires the `confirmSkillScript` special case from ADR-0005's script-approval note.
- Deny is Soft-deny: return a failed Tool result and continue the Turn; do not abort the Run.
- Prompt content is Name+args (Tool name plus truncated argument summary), not a full diff/review UI.
- Session event log records dedicated Approval events (distinct from folding the decision solely into `tool_result`).
- Multiple guarded calls in one model response are Sequential: ask and resolve each call in existing dispatch order.

## Considered Options

- **Richer approval products (session remember / permanent allowlists / policy files)** — deferred; turns a Harness teaching seam into a product surface.
- **Replace `--allow-guarded-tools` entirely** — rejected; breaks non-interactive evals and Command mode without a workable host.
- **Keep `confirmSkillScript` beside Approval** — rejected; two injection paths obscure the learning point that policy lives in `executeTool`.
- **Hard-stop the Run on deny** — rejected; diverges from today's failed-Tool-result Turn loop and hides Soft-deny as a control-flow lesson.
- **Batch-first or fail-fast-batch Approval UI** — rejected for v1; sequential dispatch already matches the Tool loop.

## Consequences

- ADR-0005's "user requires explicit confirm" script path is superseded by this unified Approval gate; scope sensitivity may still appear in the Approval prompt text.
- Hosts (Session TUI confirm bar, line REPL `[y/N]`) become the Approval UI; Harness must not assume a TTY when the bypass flag is unset in Command mode.
- `EventType` gains Approval entries so Session timelines show the pause between `tool_call` and execution/`tool_result`.
