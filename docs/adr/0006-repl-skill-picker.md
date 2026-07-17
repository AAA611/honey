# ADR-0006: REPL Skill Picker

Users need a discovery surface for Skills beyond remembering `$name`. We add a REPL-only Skill picker triggered by `/` or `/skills`, implemented in the CLI layer (not the Harness).

## Decision

- TTY: `@inquirer/prompts` arrow-key single select.
- Non-TTY: print the Skill list and prompt the user to type `$name` on the next line (no second readline question — piped stdin + multi-question readline is unreliable under spawn/tests).
- Selection prefills `$skill-name ` into the next prompt so existing explicit `$` injection applies.
- Cancel / empty list return to the prompt without starting a Run.
- **Superseded on TTY by ADR-0007**: the Session TUI `/` overlay replaces the Enter-then-inquirer Skill picker for interactive terminals.

## Considered Options

- **Full Codex-style slash command palette** — deferred; v1 is Skill-only.
- **Numbered list only** — rejected for the primary TTY path after preferring arrow-key UX.
- **Picker inside Harness** — rejected; terminal UX is not runtime domain logic.
