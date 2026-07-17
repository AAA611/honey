# Honey

**A local TypeScript harness for learning how Codex or Claude Code style agents are built.**

Honey is a small, inspectable agent runtime for studying the core loop behind modern coding agents:

- explicit state transitions
- structured JSON tool calls
- patch-first editing
- guarded vs safe tool execution
- layered context and summarization
- lightweight planning
- structured event logging
- eval fixtures and runtime tests

It is intentionally narrow. Honey is not trying to be a full hosted agent platform yet. The goal is to make the harness itself easy to read, run, modify, and extend.

---

## Why Honey

Most agent projects either:

- hide the runtime inside a large product surface, or
- stop at a toy ReAct demo with no real control boundaries

Honey aims at the middle:

- **Small enough to understand** in one sitting
- **Real enough to study** the actual harness problems
- **Structured enough to extend** toward a production-style agent runtime

If you want to understand where the seams are between provider, runtime, tools, context, and policy, this repo is meant to be that starting point.

---

## Current Capabilities

### Runtime

- Explicit state machine: `USER_INPUT -> MODEL_TURN -> TOOL_DISPATCH -> TOOL_RESULT -> DONE/ERROR`
- Provider abstraction with normalized tool-call responses
- Lightweight task plan with status tracking
- Structured event logging for run and turn inspection
- Session event log: default-on JSONL timeline under `.honey/session-logs/` (disable with `--no-session-event-log`; override dir with `--session-event-log-dir` or `HONEY_SESSION_EVENT_LOG_DIR`)

### Tools

- `read_file`
- `search_workspace`
- `exec_command`
- `apply_patch`
- `run_tests`

### Guardrails

- Safe vs guarded tool classification
- Guarded tool execution can be disabled at runtime
- Patch-first editing model

### Context

- Stable system instructions
- Current task layer
- Active working set
- Rolling summary for trimmed history

### Testing

- TypeScript typecheck
- Runtime tests with `vitest`
- Eval entrypoint for a minimal end-to-end harness run

---

## What It Is Not

Honey does **not** currently ship:

- multi-agent orchestration
- hosted services
- browser automation
- long-term memory
- advanced approval workflows
- TUI or desktop UX

Default CLI runs still use a **scripted provider** so demos and tests do not depend on an external API. An optional OpenAI-compatible Provider (DeepSeek preset) can be selected explicitly when you want a live model Turn.

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

That path exercises the real harness runtime:

1. user input enters the runtime
2. provider returns a structured tool call
3. tool executes
4. tool result is injected back into the conversation
5. runtime exits cleanly with a final assistant response

---

## Project Structure

```text
src/
  cli.ts                 # local CLI entrypoint
  types.ts               # shared runtime and provider types
  context/               # layered context and summarization
  evals/                 # minimal eval entrypoint
  logging/               # structured event logging
  planning/              # lightweight plan state
  providers/             # provider abstractions and scripted provider
  runtime/               # harness state machine
  tools/                 # tool definitions, registry, and session manager
```

Other important files:

- `specs/harness-v0-spec.md` — the V0 product and architecture spec
- `CONTEXT.md` — project glossary and domain vocabulary
- `AGENTS.md` — local agent workflow setup

---

## Architecture Overview

Honey is split around the same boundaries that matter in larger agent systems:

- **Provider** decides how model responses are normalized
- **Runtime** owns the state machine and turn loop
- **Tools** define what the agent can do in the environment
- **Context** controls what the model sees each turn
- **Planning** keeps task state out of raw transcript memory
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

Planned next steps for the harness:

- richer guarded approval flows
- stronger patch formats and edit validation
- higher-signal eval fixtures
- better session inspection and streaming UX
- optional `--provider openai-compatible` CLI sugar on top of the existing adapter

---

## Design Principles

- **Prefer explicit runtime control over prompt magic**
- **Keep tool interfaces structured**
- **Treat safety policy as code, not wording**
- **Use the smallest architecture that still teaches the right lesson**
- **Do not fake capabilities that the runtime does not yet have**

---

## License

No license file has been added yet.
