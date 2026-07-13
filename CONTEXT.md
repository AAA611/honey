# Context

This repository contains a local CLI harness project for learning how Claude Code or Codex style agent runtimes are built.

## Current domain vocabulary

- **Harness**: the runtime layer that coordinates model turns, tools, state transitions, context, policy, and outputs.
- **Provider**: the model backend adapter responsible for normalizing model I/O into runtime-owned structures.
- **Tool**: a runtime-exposed capability the model may invoke through structured calls.
- **Run**: one end-to-end execution of the harness for a user task.
- **Turn**: one model interaction cycle inside a run, including any tool calls and results.
- **Plan**: the explicit lightweight task breakdown maintained by the runtime.
- **Working set**: the active context slice sent to the model for the current turn.
- **Summary**: compressed prior context retained after trimming.

This glossary is intentionally small and should grow only when a term becomes stable and necessary.
