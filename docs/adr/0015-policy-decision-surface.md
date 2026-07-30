# ADR-0015: Unified Policy decision surface (multi-axis, behavior-equivalent first)

Tool authority today is scattered across Plan Mode offer/dispatch filters, ToolRisk/`blocked`, Workspace bound (ADR-0010), Approval (ADR-0009), and CLI bypass flags. That obscures the production seam learners need: one place to reason about “may this Tool be offered / may this call proceed?” We introduce **Policy** as that surface, without collapsing the named axes or changing v1 behavior in the first cut.

## Decision

- **Policy** owns offer-time and dispatch-time Tool authority. Offer-time returns the filtered Tool list for the Assembled prompt; dispatch-time returns a **fully named** multi-axis outcome (at least: unknown Tool, posture/Plan deny, blocked, Workspace bound reject, needs Approval, allow). CLI bypasses (`--allow-guarded-tools`, `--no-workspace-bound`) are Policy **inputs**, not parallel gates outside it.
- Axes stay first-class glossary terms: **ToolRisk**, **Workspace bound**, **Approval** (human ritual). Policy orchestrates; it does not rename or retire them.
- **Approval handshake:** Policy may return `needs Approval`; the Harness (not Policy) runs the host callback. A subsequent human deny is an Approval ritual result (Soft failure + Approval events), **not** a Policy outcome.
- **Dispatch order** remains today’s fail-closed sequence and short-circuits: posture/unknown/blocked → Workspace bound → needs Approval → allow (Bound still before Approval).
- **Round-1 scope is behavior-equivalent refactor only** — no Session remember, no policy config files, no `exec_command` / OS sandbox. Richer Approval memory and declarative config are later slices on this seam.

## Considered Options

- **Single allow/deny/ask verdict** — rejected; hides which axis fired and fights existing Session events / Soft failure copy.
- **Config/CLI unification without a runtime Policy module** — rejected; looks productized but leaves offer/dispatch rules scattered.
- **Embed Approval callback inside Policy** — rejected; couples pure axis evaluation to TUI/REPL hosts and muddies Command-mode bypass testing.
- **Treat Approval deny as a Policy outcome** — rejected; conflicts with “Policy decides, Harness asks.”
- **Ship remember / policy files / sandbox in the same cut** — deferred; seam must land before product slices weld onto the old `executeTool` if-chain.

## Consequences

- `CONTEXT.md` gains **Policy** and **ToolRisk**; Approval / Workspace bound definitions note their role under Policy.
- Harness `offeredToolDefinitions` / `executeTool` authority branches should call Policy rather than re-implement filters; existing Soft failure and event shapes stay axis-distinguishable.
- ADR-0009 and ADR-0010 remain in force for Approval and Bound semantics; this ADR adds the orchestration surface and explicitly defers remember / config / sandbox.
- A later ADR may extend Policy outcomes or inputs when Session remember, declarative policy, or process isolation ships.
