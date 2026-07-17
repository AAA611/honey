# ADR-0007: Ink Session TUI

REPL needed a Claude-style interactive surface: keystroke-level Composer, live `/` filtering, and an on-screen Transcript — not line-buffered `readline`. We adopt **Ink + React** for a Session TUI shell, kept outside the Harness.

## Decision

- TTY REPL renders `src/tui/` (Transcript + Status + Composer + slash Overlay).
- Slash overlay lists Skills plus `/context`, `/clear`, `/exit`; filtering updates as the user types after `/` without requiring Enter first.
- Selecting a Skill inserts `$name `; selecting a command executes immediately.
- Non-TTY and Command mode stay on the line/one-shot paths. Harness remains UI-free.

## Considered Options

- **Composer-only without Transcript shell** — deferred; v1 delivers the agreed full shell subset.
- **Blessed / hand-rolled ANSI** — rejected for layout/maintainability versus Ink.
- **Keep `@inquirer/prompts` as the TTY Skill path** — retired on TTY in favor of the overlay.
