# PRD: Session Event Log

Status: ready-for-agent

## Problem Statement

As a learner using honey, HarnessEvents exist only in memory for each Run, and Assembled prompt dumps are an optional separate trail. After a Session ends (or mid-crash), I cannot open one durable file and replay what happened: user input, model replies, tool calls, plan updates, and Session boundaries such as `clear`. The README already lists persistent event-log storage as a next step, but the runtime does not yet provide a Session-scoped on-disk timeline.

## Solution

Persist a **Session event log**: one Session-scoped, append-only JSONL file of structured HarnessEvents, enabled by default for both REPL mode and Command mode. The Session file is a container that preserves per-Run `runId` identity. Full Assembled prompt bodies remain behind the existing dump flag; the event log stays a replay-friendly timeline with structural assembly metadata and optional dump path links. Behavior follows ADR-0004 and the project glossary.

## User Stories

1. As a learner using honey, I want each Session to produce a single durable Session event log file, so that I can inspect the full timeline after the process exits.
2. As a learner using REPL mode, I want events from successive user inputs to append into the same Session event log, so that multi-Turn work stays on one timeline.
3. As a learner using Command mode, I want a one-shot invocation to still write a Session event log, so that I do not need REPL to study events.
4. As a learner reading a Session event log, I want each event to retain its Run `runId` and also carry `sessionId`, so that I can distinguish Runs inside one Session without losing Session identity.
5. As a learner after `clear` in REPL mode, I want the same Session event log file to continue (not rotate), so that clear-before and clear-after remain comparable on one timeline.
6. As a learner after `clear`, I want a `session_cleared` event in the log, so that the continuity reset is explicit rather than inferred from missing Transcript.
7. As a learner starting a Session, I want a `session_started` event at the beginning of the log, so that the file is self-describing (including sessionId and mode when useful).
8. As a learner exiting REPL (`exit`/`quit`) or finishing Command mode, I want a `session_ended` event when shutdown is orderly, so that normal completion is visible in the log.
9. As a learner whose process is killed mid-Run, I want events already emitted to already be on disk, so that partial timelines survive crashes.
10. As a learner opening the default log location, I want files under `.honey/session-logs/` with a timestamp and sessionId prefix in the name, so that I can find recent Sessions quickly.
11. As a learner whose repo already gitignores `.honey/`, I want Session event logs to live under that tree, so that logs are not committed by accident.
12. As a learner starting honey, I want a one-line path announcement for the Session event log, so that the default-on feature is discoverable.
13. As a learner who needs a different directory, I want to override the Session event log directory via CLI and/or environment variable, so that I can collect logs elsewhere.
14. As a learner who does not want disk writes, I want an explicit way to disable the Session event log, so that default-on does not trap me.
15. As a learner debugging model I/O, I want user input, assistant message content, and tool call/result payloads to remain in the event stream, so that the timeline answers “what was said and what tools did.”
16. As a learner studying context engineering, I want `model_request` events to carry structural Assembled prompt facts (for example assembled flag, task, workingSetCount, tokenEstimate, compaction, promptDumpPath) without the full Assembled prompt body, so that the event log does not become a second prompt archive.
17. As a learner who needs the full Assembled prompt text, I want to keep using `--dump-prompts` (and see `promptDumpPath` on related events when dumps are enabled), so that ADR-0003’s Assembled-prompt-vs-Transcript boundary stays intact.
18. As a developer of honey, I want in-memory `HarnessRunResult.events` and on-disk JSONL lines to share the same `model_request` shape (no full `systemPrompt` string), so that debugging does not fight two payload contracts.
19. As a developer of honey, I want new Session lifecycle event types (`session_started`, `session_cleared`, `session_ended`) represented in the shared event type vocabulary, so that writers and tests agree on names.
20. As a developer of honey, I want EventLogger (or the Session-owned sink it feeds) to append one JSONL line per emit when persistence is enabled, so that write timing matches the crash-resilience story.
21. As a developer of honey, I want Session—not each Run alone—to own the log file handle/path for the Session lifetime, so that “one Session, one file” is enforced at the seam that already owns `sessionId`.
22. As a developer writing tests at the HarnessSession seam, I want to assert file creation, JSONL contents, clear-append behavior, and payload shape without reaching into private append helpers, so that refactors of logging internals do not break the suite for the wrong reason.
23. As a developer writing CLI config tests, I want default-on, directory override, and disable parsing covered at the existing CLI config seam, so that flag/env behavior stays deterministic.
24. As a developer writing optional CLI process tests, I want the startup path announcement and Command-mode file creation assertable when useful, so that discoverability does not regress.
25. As a maintainer, I want this work to respect ADR-0004 (and ADR-0001 Session boundaries, ADR-0003 Assembled prompt separation), so that future contributors do not “simplify” back to in-memory-only events or dump full prompts into the Session event log.
26. As a maintainer, I want glossary terms (Session event log, Session, Run, Turn, Transcript, Assembled prompt) used consistently in code and docs touching this feature, so that “log” is not confused with Transcript or prompt dump.
27. As a learner comparing Runs inside one Session file, I want `run_started` / `run_finished` (and related turn events) to remain the Run narrative, so that Session bookends do not replace Run semantics.
28. As a learner reading tool-heavy Sessions, I want `tool_call` and `tool_result` events to remain in the Session event log, so that tool loops are replayable offline.
29. As a learner reading plan changes, I want `plan_updated` and state transition events to remain in the Session event log, so that control-plane changes are visible alongside model I/O.
30. As a learner hitting errors or max turns, I want `error` / unfinished Run events still persisted, so that failure cases teach the runtime as well as happy paths.
31. As a user without network Providers, I want Session event log behavior to work with ScriptedProvider, so that CI and local study never require live API calls.
32. As a learner enabling prompt dumps and Session event log together, I want both artifacts to coexist (JSONL timeline + markdown dumps), so that I can correlate via `promptDumpPath` when present.
33. As a developer of evals, I want eval Runs that create Sessions to either inherit default logging into a temp dir or be easily disabled, so that evals do not pollute the repo working tree unexpectedly.
34. As a maintainer updating the README roadmap, I want “persistent event-log storage” to reflect that Session event log is the shipped answer, so that docs match runtime behavior.

## Implementation Decisions

- Respect ADR-0004 as the architectural source of truth for this feature; respect ADR-0001 for Session/REPL/Command boundaries; respect ADR-0003 for Assembled prompt vs Transcript vs dump separation.
- Introduce Session-scoped persistence for HarnessEvents as a Session event log (JSONL), owned by HarnessSession for the Session lifetime.
- Keep per-`runTurn` Run identity: each Run may still construct an EventLogger (or equivalent) with its own `runId`, but emits must be forwarded/appended into the Session-owned log and include `sessionId` on persisted/shared event records.
- Default persistence on; support disable and directory override through CLI flags and environment variables (mirror the existing dump-prompts config style without conflating the two features).
- Default directory: under cwd `.honey/session-logs/`; filename pattern `<timestamp>-<sessionId-prefix>.jsonl`.
- On each emit (when enabled), append exactly one JSONL line immediately (flush enough that mid-Run crashes retain prior events).
- Emit Session lifecycle events: `session_started` when the log is opened, `session_cleared` from `clear()`, `session_ended` on orderly Session shutdown (REPL exit path and Command-mode Session completion).
- `clear()` must not create a new log file and must not allocate a new `sessionId` solely for logging; it remains a continuity reset inside the same Session.
- Change `model_request` payload shape for both in-memory events and disk: keep structural assembly fields and optional `promptDumpPath`; remove the full `systemPrompt` string from the event payload. Full Assembled prompt text remains dump-only.
- Retain timeline payloads already useful for replay: user input on run start, assistant content on model response / turn finished, tool call and tool result bodies, plan updates, errors.
- Print one stdout line announcing the Session event log path when a Session starts with logging enabled (same discoverability spirit as dump-prompts announcement).
- Domain vocabulary must follow `CONTEXT.md`: call the artifact Session event log; do not name it chat log, conversation dump, or prompt dump.
- Prefer extending EventLogger + HarnessSession over inventing a parallel event model.
- CLI process tests for path announcement / Command-mode file creation are optional if HarnessSession + CLI config seams already cover behavior; do not multiply brittle process tests without need.

## Testing Decisions

- Good tests assert externally visible behavior: files on disk, JSONL line shapes/types, Session vs Run identifiers, clear-append continuity, absence of full Assembled `systemPrompt` in `model_request`, and config defaults—not private helper implementation details.
- Primary seam: HarnessSession (extend existing harness runtime tests; ScriptedProvider). Assert Session event log creation, append-on-emit visibility after `runTurn`, lifecycle events, `clear` staying on the same file with `session_cleared`, distinct `runId`s across Runs, shared `sessionId`, structural `model_request`, and disable-does-not-write.
- Secondary seam: CLI config (`parseCliArgs` / `createCliRuntime`) for default-on, directory override, and disable via flag/env.
- Optional thin seam: CLI process tests for startup path announcement and Command-mode log creation when not already proven at the Session seam.
- Prior art: Assembled prompt dump tests in harness tests; dump-prompts flag/env tests in CLI config tests; REPL/Command coverage patterns in CLI tests.
- Use temp directories for log output in unit tests so the suite never depends on the developer’s real `.honey/` tree.

## Out of Scope

- Human-readable Markdown narrative export of the Session (second format beside JSONL)
- Merging full Assembled prompt bodies into the Session event log by default
- Rotating to a new Session / new `sessionId` / new log file on `clear`
- GUI/TUI log viewers, live tail UX, or remote log shipping
- Compressing, redacting, or encrypting Session event logs
- Replacing Transcript with the Session event log as the continuity store
- Changing Provider adapters beyond whatever is required for unchanged ScriptedProvider tests
- Writable long-term memory or cross-Session log aggregation products
- Guaranteeing `session_ended` on hard kill / SIGKILL (best-effort only; crash resilience is append-on-emit)

## Further Notes

- This PRD implements the decisions locked in the Session event log grilling session and recorded in ADR-0004.
- Glossary term **Session event log** is already in `CONTEXT.md`; keep code/docs aligned with that name.
- When naming flags and log fields, prefer glossary terms over synonyms avoided in `CONTEXT.md`.
- Prompt dumps and Session event logs are complementary: dumps teach Assembled prompt contents; the event log teaches runtime timeline and control plane.
- README roadmap item “persistent event-log storage” should be updated when this ships so learners are not pointed at a still-open promise.
