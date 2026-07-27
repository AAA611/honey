---
name: two-axis-review
description: Two-axis review of changes since a fixed point — Standards vs Spec, reported side by side. Use when the user wants to review a branch, PR, WIP diff, or says "review since X" / "two-axis review".
---

# Two-axis review

Review the diff between `HEAD` and a **fixed point** along two axes, **side by side**:

- **Standards** — does the change follow this repo's documented coding standards (plus the smell baseline)?
- **Spec** — does the change faithfully implement the originating issue / PRD / spec?

Run both axes as **parallel** sub-agents so neither pollutes the other's context. Aggregate without merging or reranking.

## Process

### 1. Pin the fixed point

Whatever the user named — commit SHA, branch, tag, `main`, `HEAD~5`, etc. If missing, ask once.

- Resolve: `git rev-parse <fixed-point>`
- Diff: `git diff <fixed-point>...HEAD` (three-dot = against merge-base)
- Log: `git log <fixed-point>..HEAD --oneline`

**Done when:** the ref resolves and the diff is non-empty. Fail here on a bad ref or empty diff — do not spawn sub-agents.

### 2. Locate the spec source

Search in order:

1. Issue refs in commit messages (`#123`, `Closes #45`, …) — fetch via `docs/agents/issue-tracker.md` if present
2. A path the user passed
3. A PRD/spec under `docs/`, `specs/`, or `.scratch/` matching the branch or feature name
4. If none: ask once. If the user says there is no spec, Spec axis reports `no spec available` and is skipped

**Done when:** you have a spec path/contents, or an explicit "no spec" decision.

### 3. Locate standards sources

Gather repo docs that say how code should be written (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md`, …).

Always also load the **smell baseline** from [SMELLS.md](./SMELLS.md). Binding rules:

- **Repo overrides** — a documented repo standard wins over a baseline smell
- **Judgement call** — baseline smells are labelled heuristics, never hard violations
- **Skip tooling** — do not flag what linters/formatters already enforce

**Done when:** you have the standards file list + smell baseline text ready to paste into the Standards sub-agent.

### 4. Spawn both axes in parallel

One message, two `Task` calls (`subagent_type: generalPurpose`). Each sub-agent must re-run the diff itself from the commands you give — do not paste the whole diff into the parent if it is large.

**Standards brief** — include: diff + log commands; standards file paths; **full** smell baseline paste; instruct:

> Report per file/hunk: (a) documented-standard breaches — cite file + rule; (b) baseline smells — name the smell, quote the hunk. Hard vs judgement: documented breaches may be hard; smells are always judgement; repo overrides baseline. Skip tooling-enforced issues. Under 400 words.

**Spec brief** — include: diff + log commands; spec path or contents; instruct:

> Report: (a) missing/partial requirements; (b) scope creep (behaviour not asked for); (c) implemented-but-wrong. Quote the spec line for each finding. Under 400 words.

If no spec: skip Spec sub-agent.

**Done when:** both (or Standards-only) sub-agents have returned.

### 5. Aggregate side by side

Present under `## Standards` and `## Spec` — verbatim or lightly cleaned. **Do not merge, dedupe, or rerank across axes.**

End with one line: findings count per axis, and the worst issue *within each axis* (if any). No single cross-axis winner.

**Done when:** both headings are present (or Spec explicitly skipped) and the one-line summary is written.

## Why two axes

A change can pass one and fail the other:

- Right shape, wrong behaviour → Standards pass, Spec fail
- Right behaviour, wrong conventions → Spec pass, Standards fail

Keeping them **side by side** stops one axis from masking the other.
