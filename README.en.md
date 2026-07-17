[中文](README.md) | English

<p align="center">
  <img src="docs/assets/honey-banner.svg" alt="HONEY" width="100%" />
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node.js >=18.18" src="https://img.shields.io/badge/Node.js-%3E%3D18.18-339933?logo=nodedotjs&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" />
  <img alt="version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-0B6E4F" />
</p>

<p align="center">
  <img alt="Harness" src="https://img.shields.io/badge/Harness-FFAF00" />
  <img alt="Skills" src="https://img.shields.io/badge/Skills-E67E22" />
  <img alt="REPL" src="https://img.shields.io/badge/REPL-2E86AB" />
  <img alt="Patch-first" src="https://img.shields.io/badge/Patch--first-27AE60" />
  <img alt="Session Log" src="https://img.shields.io/badge/Session%20Log-8E44AD" />
</p>

# Honey

**A local TypeScript Harness for learning how Codex or Claude Code style agents are built.**

Honey is a small, inspectable agent runtime for studying the core loop behind modern coding agents:

- explicit state transitions
- structured JSON tool calls
- patch-first editing
- guarded vs safe tool execution
- layered context and summarization
- lightweight planning
- structured event logging
- eval fixtures and runtime tests
- Skill package discovery, catalog injection, and script execution

It is intentionally narrow. Honey is not trying to be a full hosted agent platform yet. The goal is to make the Harness itself easy to read, run, modify, and extend.

---

## Why Honey

Most agent projects either:

- hide the runtime inside a large product surface, or
- stop at a toy ReAct demo with no real control boundaries

Honey aims at the middle:

- **Small enough to understand** in one sitting
- **Real enough to study** the actual Harness problems
- **Structured enough to extend** toward a production-style agent runtime

If you want to understand where the seams are between Provider, Runtime, Tools, Context, and policy, this repo is meant to be that starting point.

---

## Current Capabilities

### Runtime

- Explicit state machine: `USER_INPUT -> MODEL_TURN -> TOOL_DISPATCH -> TOOL_RESULT -> DONE/ERROR`
- Provider abstraction with normalized tool-call responses
- Lightweight Plan with status tracking
- Structured event logging for Run and Turn inspection
- Session event log: default-on JSONL timeline under `.honey/session-logs/` (disable with `--no-session-event-log`; override dir with `--session-event-log-dir` or `HONEY_SESSION_EVENT_LOG_DIR`)

### Tools

- `read_file`
- `search_workspace`
- `exec_command`
- `apply_patch`
- `run_tests`
- `run_skill_script`

### Skills

- Skill filesystem packages (`SKILL.md` plus optional scripts / references)
- Skill catalog injected into the Assembled prompt Root set
- Explicit `$name` injection and on-demand `read_file` loading
- REPL Skill picker / slash overlay (`/` or `/skills`)
- Plugin remains a distribution placeholder in v1 (see `src/plugins/types.ts`)

### Guardrails

- Safe vs guarded Tool classification
- Guarded Tool execution can be disabled at runtime
- Patch-first editing model
- Skill script approval by Skill scope (bundled / repo / user)

### Context

- Stable system instructions
- Current Task layer
- Active Working set
- Rolling Summary for trimmed history

### Session UX

- Command mode: one-shot `honey "<prompt>"`
- REPL mode: Session TUI on TTY (Transcript + Composer + slash Overlay)
- Session banner: branded welcome surface on Session entry

### Testing

- TypeScript typecheck
- Runtime tests with `vitest`
- Eval entrypoint for a minimal end-to-end Harness run

---

## What It Is Not

Honey does **not** currently ship:

- multi-agent orchestration
- hosted services
- browser automation
- long-term memory
- advanced approval workflow products
- desktop / full IDE UX (Session TUI covers the REPL shell only)

Default CLI runs still use a **scripted Provider** so demos and tests do not depend on an external API. An optional OpenAI-compatible Provider (DeepSeek preset) can be selected explicitly when you want a live model Turn.

---

## Quick Start

### Requirements

- Node.js `>= 18.18`
- npm

### Install

```bash
npm install
```

### Local terminal install

Primary local-dev path:

```bash
npm install
npm run build
npm link
honey
```

Packaged install validation path:

```bash
npm install
npm run build
npm pack
npm install -g ./honey-0.1.0.tgz
honey
```

### Validate the project

```bash
npm run typecheck
npm test
npm run build
```

### Run the demo CLI

```bash
npm start
```

Or pass a prompt directly:

```bash
node dist/cli.js "read: CONTEXT.md"
node dist/cli.js "search: Harness"
```

### Run the eval entrypoint

```bash
npm run eval
```

---

## CLI Behavior Right Now

Default: scripted Provider.

Supported scripted demo prompt patterns:

- `read: <path>`
- `search: <query>`

Example:

```bash
npm run build
node dist/cli.js "read: CONTEXT.md"
```

Optional live DeepSeek preset (OpenAI Chat Completions–compatible; requires an API key). This is a **manual smoke** path — automated tests use a fake HTTP transport and do **not** call DeepSeek in CI:

```bash
export DEEPSEEK_API_KEY=...
honey --provider deepseek --allow-guarded-tools "read CONTEXT.md and summarize"
```

Overrides: `--model`, `--base-url`, or env `HONEY_MODEL` / `HONEY_BASE_URL`. Key fallback: `HONEY_API_KEY`. Guarded Tools stay off unless `--allow-guarded-tools` is set. Live calls are opt-in via `--provider deepseek`; missing credentials fail loudly.

That path exercises the real Harness runtime:

1. user input enters the runtime
2. Provider returns a structured tool call
3. Tool executes
4. Tool result is injected back into the conversation
5. runtime exits cleanly with a final assistant response

---

## Project Structure

```text
src/
  cli.ts                 # local CLI entrypoint
  cli/                   # CLI helpers (e.g. Skill picker fallback)
  types.ts               # shared runtime and Provider types
  context/               # layered context and summarization
  evals/                 # minimal eval entrypoint
  logging/               # structured event logging
  planning/              # lightweight Plan state
  plugins/               # Plugin distribution placeholder types
  providers/             # Provider abstractions and scripted Provider
  runtime/               # Harness state machine
  skills/                # Skill discovery, parsing, catalog, bundled Skills
  tools/                 # Tool definitions, registry, and session manager
  tui/                   # Session TUI (Ink + React)
```

Other important files:

- `specs/harness-v0-spec.md` — the V0 product and architecture spec
- `CONTEXT.md` — project glossary and domain vocabulary
- `AGENTS.md` — local agent workflow setup
- `docs/adr/` — architecture decision records

---

## Architecture Overview

Honey is split around the same boundaries that matter in larger agent systems:

- **Provider** decides how model responses are normalized
- **Runtime** owns the state machine and turn loop
- **Tools** define what the agent can do in the environment
- **Skills** package reusable task instructions (plus optional scripts), distinct from Tools
- **Context** controls what the model sees each Turn
- **Planning** keeps task state out of raw Transcript memory
- **Logging** captures a replay-friendly event stream

This separation is the point of the project.

---

## Development

### Main scripts

```bash
npm run typecheck
npm test
npm run build
npm run eval
npm start
```

### Typical workflow

```bash
npm install
npm run typecheck
npm test
npm run build
npm run eval
```

---

## Roadmap

Planned next steps for the Harness:

- richer guarded approval flows
- stronger patch formats and edit validation
- higher-signal eval fixtures
- better Session inspection and streaming UX
- optional `--provider openai-compatible` CLI sugar on top of the existing adapter
- Plugin install and MCP bundling (beyond the v1 Skill core loop)

---

## Design Principles

- **Prefer explicit runtime control over prompt magic**
- **Keep Tool interfaces structured**
- **Treat safety policy as code, not wording**
- **Use the smallest architecture that still teaches the right lesson**
- **Do not fake capabilities that the runtime does not yet have**

---

## License

No license file has been added yet.
