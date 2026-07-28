# ADR-0014: Model-driven Soft failure (no Harness auto-remediation)

Coding-agent Harnesses often look “smart” by auto-retrying or rewriting Tool calls when something fails. Honey is a teaching runtime: the learner should see **Soft failure → Working set → next Turn**, not a hidden remediation loop. We choose **Model-driven** recovery: actionable Soft failure text plus System guidance; Harness does not invent alternate Tool calls.

## Decision

- **Ownership:** Soft failures continue the Run; the model changes parameters, switches Tools, or re-probes. No Harness-owned auto-remediation / retry state machine.
- **Soft vs Hard:** Soft covers Tool execution failures, Approval deny, Workspace bound rejection, unavailable/unsupported Tool or Connector outcomes, and Environment mismatches reported via Tool results. Hard (Run `ERROR`) is for Provider/transport failure, illegal stop reason, and hard budget exhaustion. A successful Tool result that misses Task acceptance is **not** a Soft failure.
- **Contract (v1):** Keep `{ ok, content }` with actionable free-text (what / why / what to try) plus short System rules (diagnose before retry; do not blindly repeat the same failing call). No structured recovery error-code schema in v1.
- **Thrashing:** Rely on existing `maxTurns` plus System guidance; no Soft-failure-specific circuit breaker in v1.
- **Environment:** Stay lean; do not add Session-start capability probing for this feature.
- **v1 scope:** System prompt + Harness dispatch Soft failure paths (unknown Tool, Approval deny, Workspace bound, execute catch, etc.). Built-in Tool and Connector message polish is incremental follow-up.

## Considered Options

- **Harness-owned remediation** — rejected; hides the recovery seam and drifts toward orchestration.
- **Hybrid with limited auto-fixes** — deferred; adds classification surface before Soft failure prose is good enough.
- **Structured recovery fields (`code` / `hint` / `retryable`)** — deferred until free-text + System guidance prove insufficient.
- **Thicker Environment / startup probes** — rejected for v1; prefer Soft failure text over proactive capability inventory.
- **Soft-failure circuit breaker** — deferred; `maxTurns` is already the hard cap.

## Consequences

- Soft failure / Hard failure enter the domain glossary; implementation should not reintroduce throw-to-abort for Soft paths.
- Future structured codes or limited Harness remediation would supersede parts of this ADR deliberately, not by accident.
