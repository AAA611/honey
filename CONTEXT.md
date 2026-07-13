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
- **Session**: one interactive terminal conversation started by launching `honey`, preserving conversation, context, plan, and event continuity until the user exits.
- **REPL mode**: the interactive terminal mode entered by running `honey` with no prompt argument, using single-line input and repeated turns.
- **Command mode**: the one-shot CLI mode entered by running `honey "<prompt>"`, executing a single request and exiting.
- **Bin entrypoint**: the packaged executable command exposed as `honey` through npm's `bin` field.

This glossary is intentionally small and should grow only when a term becomes stable and necessary.
