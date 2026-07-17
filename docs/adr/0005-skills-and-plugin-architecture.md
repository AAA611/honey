# ADR-0005: Skills and Plugin Architecture

Honey needs a Codex-aligned way to package reusable workflows without conflating them with Tools or Project instructions. We will treat a **Skill** as a filesystem package (`SKILL.md` plus optional resources), expose a compact **Skill catalog** in the Assembled prompt Root set, and keep **Plugin** as a distribution placeholder only in v1.

## Decision

- Progressive disclosure: inject name/description/path (and resource pointers) every Turn; load Skill bodies on demand.
- Implicit load: the model reads `SKILL.md` via `read_file` (no `activate_skill` tool). Explicit `$name` is Harness-preprocessed and injects the body for that Run only; bodies remain Compaction-eligible like other refetchable content.
- Discovery scopes: repo, user, and bundled. Dual roots `.agents/skills` and `.honey/skills`. Precedence: repo > user > bundled; within a scope `.honey` > `.agents`.
- Scripts: dedicated `run_skill_script` Tool; package-relative paths only; approval by scope (bundled/repo follow guarded policy; user requires explicit confirm; unknown rejected).
- Code lives under `src/skills/` with a `src/plugins/types.ts` placeholder. Plugin install and MCP bundling are out of scope for v1.

## Considered Options

- **Dedicated `activate_skill` Tool for implicit load** — rejected; diverges from Codex/Claude filesystem progressive disclosure.
- **Promote activated Skill bodies into Root set / Pinned** — rejected for v1; conflicts with Compaction-as-refetchable learning goals.
- **Full Plugin install + MCP in v1** — rejected; expands scope past the Skill core loop.
- **Harness-proxied arbitrary shell via Skill path** — rejected; `run_skill_script` is not a second `exec_command`.
