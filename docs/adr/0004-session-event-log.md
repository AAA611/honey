# ADR-0004: Session Event Log

Honey's structured HarnessEvents lived only in memory per Run, while Assembled prompt dumps were an optional separate markdown trail. Learners could not replay a full Session timeline after exit. We will persist a **Session event log**: one Session-scoped append-only JSONL file of HarnessEvents, default-on, for both REPL and Command mode.

## Decision

- The Session owns the log file; each Run keeps its own `runId` inside that file and events also carry `sessionId`.
- Format is JSONL with immediate append on each emit.
- `clear` does not rotate the file; it emits `session_cleared` and continues. Bookend with `session_started` and `session_ended`.
- Assembled prompt bodies stay out of the event log; `model_request` carries structural layer metadata and optional `promptDumpPath` only. Full prompts remain behind `--dump-prompts`.
- Default path: `.honey/session-logs/<timestamp>-<sessionId-prefix>.jsonl` (under the already-gitignored `.honey/`).

## Considered Options

- **Transcript export as the primary artifact** — rejected; Transcript is continuity, not the runtime timeline.
- **One file merging events and full Assembled prompts** — rejected; blurs ADR-0003 boundaries and explodes size.
- **One JSONL file per Run** — rejected; breaks the “one Session, one log” learning surface.
- **Rotate file on `clear`** — rejected; conflicts with current `sessionId` lifetime and hides clear-before/after comparison on one timeline.

## Consequences

Learners get a durable, replay-friendly Session timeline by default. Event payloads must stay timeline-shaped (user input, assistant text, tool I/O, structural assembly facts) rather than becoming a second prompt archive.
