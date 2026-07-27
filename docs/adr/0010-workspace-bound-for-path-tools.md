# ADR-0010: Workspace Bound for Path-Taking Tools

Approval (ADR-0009) gates *whether* a guarded Tool may run, but path-taking Tools still resolve with bare `path.resolve(cwd, …)` and can escape the Session cwd — including **safe** `read_file`, which never hits Approval. We will add **Workspace bound**: Harness-enforced realpath confinement under Session `cwd`, separate from Approval and from OS sandbox / command allowlists.

## Decision

- Bound root **is** Session `cwd` (Environment cwd). No separate discovered repo root in v1.
- Applies to **all path-taking Tools** regardless of ToolRisk (`read_file`, `apply_patch`, and any Tool that declares path args).
- Enforcement is **Harness gate + shared resolve helper**: Tools declare `pathParams: string[]` on the Tool definition; Harness checks those args before Approval / execute; Tools also resolve via the same helper so local I/O cannot drift.
- Checks use **realpath after symlink resolution**, not lexical prefix alone. Non-existent paths resolve via the longest existing real prefix plus remaining segments.
- For guarded path Tools, Bound runs **before** Approval: escape → failed Tool result, no interactive prompt.
- Violations emit a **dedicated Session event** plus a failed Tool result (not folded solely into opaque `tool_result` text).
- Default **on**. Explicit `--no-workspace-bound` may disable it; that flag is **orthogonal** to `--allow-guarded-tools`.
- v1 **does not** confine `exec_command` / shell process escape or Skill-script side effects beyond existing package-relative script path checks. Bound ≠ process isolation; that limit is intentional and documented.

## Considered Options

- **Policy memory / allowlists / richer Approval** — deferred earlier; wrong axis for “safer Tools” once Approval exists.
- **Command allowlist or OS sandbox as v1** — rejected; product/platform weight, obscures the cwd-as-permission-root lesson.
- **Lexical-only path checks** — rejected; symlink escape makes Bound cosmetic.
- **Bound only on guarded write Tools** — rejected; safe `read_file` is the quiet exfiltration path.
- **Approval before Bound, or merge into Approval UI** — rejected; confuses human permit with geometric policy.
- **Tie Bound disable to `--allow-guarded-tools`** — rejected; collapses two knobs and re-opens arbitrary paths whenever guarded bypass is on.
- **Hardcode path Tool names in Harness without `pathParams`** — rejected for the declaration seam; a small `pathParams` list keeps the Harness scan generic as Tools grow.
- **Constrain shell in the same v1** — deferred; heuristics fake safety; real isolation is a later decision.

## Consequences

- `Tool` definitions gain `pathParams`; `read_file` / `apply_patch` must opt in.
- `executeTool` order becomes: unknown/blocked → Workspace bound (unless disabled) → Approval (if guarded and not bypassed) → execute.
- CLI / config gain `noWorkspaceBound` (or equivalent) beside `allowGuardedTools`.
- Session event log gains a Bound-rejection event type alongside Approval events.
- Docs and glossary must keep saying: Workspace bound does not make `exec_command` safe outside cwd.
