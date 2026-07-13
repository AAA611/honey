# ADR-0001: Terminal Entrypoint and REPL Shape

## Status

Accepted

## Context

Honey currently has a one-shot CLI entrypoint, but the intended user experience is closer to tools like Claude Code: install once, then enter an interactive terminal session by typing a single command.

The project needs a first implementation path that is realistic enough to study, but still small enough to keep the runtime easy to understand.

## Decision

Honey will introduce a packaged terminal entrypoint exposed as the `honey` command.

The first version of terminal mode will follow these constraints:

- The package will be shaped for a real npm executable from the start, including a proper `bin` entrypoint.
- Local development will primarily use `npm link`.
- Documentation will also provide a `npm pack` based install path to validate the packaged install flow.
- Running `honey` with no prompt argument will enter an interactive REPL mode.
- Running `honey "<prompt>"` will keep one-shot command mode.
- The REPL will be implemented first with Node's minimal readline model rather than a richer terminal UI framework.
- The REPL will use single-line input only in the first version.
- A single launch of `honey` will preserve one shared session context across turns until the user exits.
- The first built-in commands will stay minimal, limited to `exit`, `quit`, and optionally `clear`.

## Consequences

### Positive

- Honey gets a real command-line product surface instead of a dev-only node invocation.
- The project can study session continuity, prompt loop behavior, and terminal ergonomics without taking on a large TUI dependency surface.
- The package structure will already be aligned with later npm publishing.

### Negative

- The first REPL experience will be intentionally plain compared with richer agent CLIs.
- Multi-line input, slash-command systems, and streaming-oriented terminal UX are explicitly deferred.

## Follow-up

- Add the `bin` entrypoint and package metadata required for local linking.
- Refactor the CLI into one-shot command mode plus shared-session REPL mode.
- Update README install and usage guidance around `npm link` and `npm pack`.
