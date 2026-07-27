# ADR-0011: Project Instructions Discovery (User ⊕ Project)

ADR-0003 established read-only **Project instructions** in the Root set, loaded at Session start from repo guidance files. The first loader only read `<cwd>/AGENTS.md` and `<cwd>/CONTEXT.md` and joined them. To learn Claude Code–style discovery without renaming the product surface, we narrow the file contract and add a two-layer Instruction source merge.

## Decision

- **Filename:** only `AGENTS.md`. `CONTEXT.md` stays the domain glossary and is not auto-injected as Project instructions (refines ADR-0003 §8's example list).
- **Instruction sources (v1):** `user` and `project` only — no nested/subdirectory stacking and no separate Project root entity.
- **Project source:** `<Session cwd>/AGENTS.md` (same cwd story as Environment / Workspace bound).
- **User source:** winner-take-all among `~/.honey/AGENTS.md` then fallback `~/.agents/AGENTS.md` (align with Skill/MCP user roots; do not concatenate both user files).
- **Merge:** concatenate user then project (general → specific), with labeled sections — not structured override merging.
- **Budget:** one merged char budget; if over budget, preserve the project layer and cut/spill the user layer first (reject naive merge-then-tail-truncate that drops project).
- **Lifecycle:** load at Session start; no per-Turn disk reread; explicit `/reload-instructions` re-runs discovery and replaces the Project instructions layer.
- **Observability:** Context inventory lists resolved Instruction source paths and whether merged truncation applied.
- **Naming:** use **Instruction source** for these origins; do not overload **Skill scope**.

## Considered Options

- **Subdirectory / path-stacked CLAUDE.md walk** — deferred; high path-policy cost relative to learning user⊕project merge.
- **Keep injecting `CONTEXT.md` as Project instructions** — rejected; mixes domain glossary with agent workflow guidance and confuses the teaching seam.
- **Project-then-user merge (personal override last)** — rejected for default; honey treats cwd team guidance as the nearer truth. Personal preference remains the base layer.
- **Per-Turn automatic reload** — rejected; discovery contract stays Session-stable unless the user opts into `/reload-instructions`.
- **Product name "CLAUDE.md"** — rejected; glossary Avoid stands; mechanism is Project instructions.

## Consequences

- ADR-0003's Project instructions bullet remains valid as "read-only Root set guidance," but file discovery and examples follow this ADR.
- `loadProjectInstructions` gains a structured result (text + Instruction sources + truncation flag), not only a string.
- Session TUI / line REPL gain `/reload-instructions`; `/context` grows source lines under Project instructions.
- Follow-ups (not in this ADR): upward discovery walk, `CLAUDE.md` compatibility alias, per-source quotas, subdirectory stacking.
