# ADR-0013: Plan Mode as a read-only Session posture

Honey already injects a lightweight progress layer into the Assembled prompt. Product-facing **Plan Mode** (read-only exploration that produces an executable specification) must not overload that layer. We split the vocabulary and pin Plan Mode as a Session posture with an explicit handoff to mutating execution.

## Decision

- **Terms:** Rename the progress layer to **Step checklist**. **Plan** is the Markdown specification document. **Plan Mode** is the Session posture that produces it.
- **Posture:** Plan Mode persists across Turns until the user exits. Enter `/plan`; accept-and-run `/execute`; abandon `/plan-exit`. Exit is never inferred from model text. Re-entry after `/execute` is allowed; the workspace is not auto-rolled back.
- **Read-only workspace:** Orthogonal to ToolRisk/Approval. Offer a read allowlist plus `update_plan` (v1: `read_file`, `search_workspace`); omit mutating Tools from the Assembled prompt; fail closed at dispatch. `exec_command` stays off the allowlist.
- **Plan document:** Session-scoped Markdown in honey state (outside cwd), written only via `update_plan`. Light section guidance (Goal / Scope / Approach / Acceptance / Risks); v1 does not schema-reject missing headings. Empty Plan rejects `/execute`. Default is not a workspace file.
- **Prompt:** In Plan Mode, inject a planning-oriented Step checklist and the current Plan (or empty marker) in the Root set. On `/execute`, promote Plan → Task framing, soft-continue Transcript/Working set, rebuild an execution-oriented Step checklist; keep Plan as an archive unless Plan Mode is re-entered.
- **`/clear`:** Leaves Plan Mode if active and discards the Plan document with Transcript / Step checklist / Working set. `/plan-exit` keeps the Plan as a draft.

## Considered Options

- **Keep calling the checklist Plan / call the product Plan Mode** — rejected; glossary collision.
- **Spec mode naming** — rejected for product familiarity; Plan Mode kept, checklist renamed instead.
- **Per-Run-only Plan Mode** — rejected; specifications need multi-Turn clarification as a Session posture.
- **Parse assistant prose as the Plan** — rejected; `/execute` needs a Harness-owned slot (`update_plan`).
- **Write `PLAN.md` into the workspace during Plan Mode** — rejected; breaks the read-only workspace contract. Export to the repo is a later, explicit leave-posture action.
- **Hard-clear Transcript on `/execute`** — rejected for v1; soft-continue preserves exploration context and relies on existing Compaction.
- **Reuse ToolRisk safe/guarded as read/write** — rejected; those flags mean Approval, not mutation effect.
- **Auto-revert workspace on re-entering Plan Mode** — deferred; larger product surface than v1.

## Consequences

- ADR-0003’s “Task ≠ Plan” wording still holds in spirit, but **Plan** there meant today’s **Step checklist**; implementers should read Plan Mode / Plan / Step checklist from `CONTEXT.md` and this ADR.
- Code and slash copy that still say `Plan` for the checklist need a rename pass when Plan Mode is implemented.
- Command-mode `--plan`, workspace export of the Plan document, and execution-time auto-revert remain out of v1.
