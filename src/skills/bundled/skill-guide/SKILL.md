---
name: skill-guide
description: Explain how honey Skills work and when to load SKILL.md or run packaged scripts. Use when the user asks about skills, plugins, $mentions, or progressive disclosure.
---

# Honey Skill guide

Skills are reusable workflow packages. The Assembled prompt only includes the Skill catalog until a Skill is needed.

## Progressive disclosure

1. Read the Skill catalog in the system prompt (names, descriptions, file paths).
2. When a Skill matches the Task, call `read_file` on that Skill's `file` path to load `SKILL.md`.
3. Read `references/` files only when the Skill body points to them.
4. Run packaged scripts only through `run_skill_script` with a `scripts/...` relative path.

## Explicit invocation

If the user writes `$skill-guide`, the Harness injects this body for the current Run. You do not need to re-read it unless Compaction cleared the Working set copy.
