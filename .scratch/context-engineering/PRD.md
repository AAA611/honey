# PRD: Context Engineering (Assembled Prompt)

Status: ready-for-agent

## Problem Statement

As a learner building honey, the current context path feels like a demo: Working set is capped by message count, “Summary” is truncated string concatenation, and the Provider still receives the full Transcript while layered fields are mostly logged. I cannot study real context governance—token pressure, Compaction, Root set survival, Task vs Plan—because those concepts are not what the model actually sees.

## Solution

Make the Harness own context engineering end-to-end. Each Turn, the Provider receives only an Assembled prompt built from ordered layers. The Session keeps a durable Transcript separately. Under a token budget, Compaction first clears or shrinks re-fetchable tool results, then compresses older history into Summary when still over budget. A Root set (including Task, Plan, Environment, Project instructions, Pinned artifacts, and Summary) is re-injected after Compaction. Learners can inspect a Context inventory in Session and review per-Turn structural snapshots. Behavior follows ADR-0003 and the project glossary.

## User Stories

1. As a learner using honey, I want the Provider to see an Assembled prompt rather than the raw Transcript, so that context governance is a real runtime behavior I can study.
2. As a learner using honey, I want the Session to keep a durable Transcript for continuity and inspection, so that I can still audit what happened even when the Assembled prompt is compacted.
3. As a learner using honey, I want System instructions to remain a stable Assembled prompt layer, so that policy and identity are not drowned by tool noise.
4. As a learner using honey, I want read-only Project instructions loaded at Session start from repository guidance files, so that stable project rules survive Compaction without building a writable long-term memory system.
5. As a learner using honey, I want a Task layer that states the current goal and acceptance framing, so that “what done means” is explicit and not buried only inside Plan steps.
6. As a learner using honey, I want Plan to remain an ordered step checklist with statuses inside the Assembled prompt, so that progress survives trimming and is distinct from Task.
7. As a learner using honey, I want an Environment layer (for example cwd and policy summary) in the Assembled prompt, so that execution-setting facts stay visible after Compaction.
8. As a learner using honey, I want a Working set layer of recent dialogue and tool I/O, so that the model still sees fresh interaction without receiving the entire Transcript.
9. As a learner using honey, I want a Summary layer that replaces older compacted history, so that long Sessions remain coherent without growing forever.
10. As a learner using honey, I want Pinned artifacts that stay outside ordinary Working set rotation and remain in the Root set, so that deliberately retained excerpts are not silently dropped by Compaction.
11. As a learner using honey, I want Harness policy to create initial Pinned artifacts automatically (for example from user path mentions or current edit targets), so that pinning works before model-owned pin tools exist.
12. As a learner using honey, I want later support for explicit model pin/unpin under Harness quotas without redesigning the Assembled prompt contract, so that dual-channel pinning remains a compatible extension.
13. As a learner using honey, I want Compaction to trigger from a token budget rather than message-count alone, so that I learn the same pressure model real agent runtimes face.
14. As a learner using honey, I want Compaction to clear or shrink re-fetchable tool results before summarizing history, so that cheap recovery of file contents is preferred over expensive Summary loss.
15. As a learner using honey, I want a deterministic Summary writer first, so that Compaction behavior is testable and reproducible in CI.
16. As a learner using honey, I want the Summary contract to allow a later model-Turn writer without changing Root set or Assembled prompt shape, so that smarter summarization can be swapped in later.
17. As a learner using honey, I want local token-heuristic metering on every Turn, so that budget checks work with scripted and OpenAI-compatible Providers alike.
18. As a learner using honey, I want optional Provider-exact token calibration when available, without requiring it for Compaction to function, so that precision is an enhancement not a hard dependency.
19. As a learner using honey, I want the Root set re-injected after every Compaction, so that System, Project instructions, Task, Summary, Plan, Environment, and Pinned artifacts are not erased when Working set shrinks.
20. As a learner using REPL mode, I want soft-continue of Task by default when my next line continues the same work, so that multi-step Sessions feel natural.
21. As a learner using REPL mode, I want an explicit way to force a hard Task switch (including clear-style Session reset semantics where already defined), so that unrelated requests do not corrupt the Root set.
22. As a learner using REPL mode, I want automatic Task replace only on high-confidence signals (for example completed Plan plus a clearly new goal), so that misclassification is rare and recoverable.
23. As a learner using Command mode, I want a one-shot Run to still assemble context for that single request, so that both entry modes share the same context engineering path.
24. As a learner using honey, I want a Context inventory command in Session that shows layer token estimates, Compaction status, and Root set membership, so that I can see what the model is about to receive.
25. As a learner using honey, I want each Turn to persist a structural Assembled prompt snapshot, so that I can inspect assembly offline after a session ends.
26. As a learner using honey, I want model_request (or equivalent) events to reflect assembled layers rather than implying Transcript passthrough, so that event logs teach the real request shape.
27. As a learner using honey, I want Tool loops to continue working after Compaction, so that clearing old tool results does not break call/result pairing needed by the Provider.
28. As a learner using honey, I want oversized single tool results to be truncated or summarized for the Assembled prompt while remaining inspectable in Transcript or tool logs where practical, so that one grep dump cannot blow the budget alone.
29. As a developer of honey, I want ScriptedProvider tests to assert the messages/system content passed into `sendTurn` match the Assembled prompt, so that passthrough regressions fail loudly.
30. As a developer of honey, I want HarnessSession snapshot (or equivalent) to expose context layers distinctly from Transcript, so that Session continuity tests can assert both stores.
31. As a developer of honey, I want Compaction outcomes asserted by preserved Task/Plan/Pinned/Project instructions and reduced working pressure, not by exact Summary wording, so that deterministic writers can evolve phrasing safely.
32. As a developer of honey, I want REPL Task transition behavior covered at the HarnessSession seam, so that soft-continue and hard-switch rules do not live only in prose.
33. As a developer of honey, I want Context inventory output covered at the CLI/REPL command seam, so that the educational introspection surface does not regress.
34. As a maintainer, I want this work to respect ADR-0003, so that future contributors do not “simplify” back to Transcript-to-Provider passthrough or message-count-only trimming.
35. As a maintainer, I want glossary terms (Assembled prompt, Transcript, Working set, Summary, Compaction, Root set, Task, Plan, Project instructions, Pinned artifact, Context inventory, Environment) used consistently in code and docs touching this feature, so that the learning vocabulary stays coherent.
36. As a learner comparing to Claude Code, I want honey’s Compaction to stay two-stage (tool clearing then Summary) rather than a full production cascade, so that the architecture remains teachable.
37. As a learner comparing to Codex, I want Task (goal/acceptance) separated from Plan (milestones/steps), so that those two signals are not collapsed into one string field.
38. As a user without network Providers, I want all of the above to work with ScriptedProvider, so that studying context engineering never requires live API calls.
39. As a user who enables DeepSeek or another OpenAI-compatible Provider later, I want the same Assembled prompt path to feed that Provider unchanged, so that context engineering stays Provider-agnostic.
40. As a learner hitting max Turns or errors, I want Compaction and assembly state to remain coherent in snapshots and events, so that failure cases still teach the architecture.
41. As a learner after `clear` in REPL mode, I want Session-scoped context layers that should reset to reset consistently with banner/Session semantics, so that clear is a real continuity boundary for Task/Plan/context as well as display.
42. As a learner reading Project instructions, I want missing optional instruction files to degrade gracefully (empty Project instructions), so that Sessions still start in repos without those files.
43. As a learner with large Project instructions, I want quota/truncation behavior that keeps the Rest of the Root set usable, so that one huge guidance file cannot monopolize the budget unnoticed.
44. As a developer writing evals, I want fixture Runs to still complete under Assembled prompt assembly, so that eval entrypoints remain deterministic with ScriptedProvider.
45. As a learner, I want Working set never to be confused with the entire Assembled prompt in inventory/UI copy, so that the glossary distinction stays visible in the product surface.

## Implementation Decisions

- Respect ADR-0003 as the architectural source of truth for this feature; respect ADR-0001 for REPL/Command Session boundaries and built-in commands.
- Change the Provider Turn input path so `sendTurn` receives the Assembled prompt (system + assembled messages equivalent), never the raw Transcript wholesale.
- Keep Transcript as Session-durable history for inspection, continuity decisions, and tooling audit; update Session snapshot language to distinguish Transcript from Assembled prompt layers.
- Introduce or reshape context modules so assembly, token heuristics, Compaction (tool-result clearing then Summary), Root set re-injection, and Pinned policy are Harness-owned—not prompt-text suggestions.
- Layer inventory for assembly: System, Project instructions, Task, Plan, Environment, Summary, Working set, Pinned artifacts.
- Task is current goal + acceptance framing; Plan is steps with statuses. Stop using a dead placeholder Task string as a stand-in for Session identity.
- Project instructions: read-only load at Session start from agreed repo guidance files (for example `AGENTS.md` / `CONTEXT.md`); not a writable memory subsystem.
- Compaction pressure: primary signal is local token heuristic against a configured budget; message-count-only triggers are not the primary mechanism.
- Compaction stages: (1) clear/shrink re-fetchable tool results in Assembled prompt history; (2) write Summary via deterministic writer and drop the compacted older material from the Assembled prompt Working set path.
- Summary writer interface should allow a later model-Turn implementation under the same Summary contract; v1 ships deterministic only.
- Pinned artifacts: v1 Harness-automatic only under quotas; leave extension points for later explicit model pin/unpin without changing Root set membership rules.
- REPL Task continuity: soft-continue default; user-forced hard switch; automatic replace only on high-confidence heuristics (completed Plan + clearly new goal). Align with existing `clear` Session reset where applicable.
- Context inventory: Session-visible command (name consistent with minimal built-in command style) showing per-layer token estimates, Compaction status, and Root set membership.
- Persist a per-Turn structural Assembled prompt snapshot (layer/token/compaction metadata—not necessarily the full raw prompt body if that harms debuggability tradeoffs; structure must be sufficient to reconstruct what was sent).
- Emit events so model requests observe assembled layer/compaction facts rather than implying Transcript passthrough.
- Domain vocabulary must follow `CONTEXT.md`; avoid calling Assembled prompt “chat history,” and avoid calling Project instructions “long-term memory.”
- Prefer extending the existing HarnessSession/HarnessRuntime loop over introducing a second parallel runtime for context.
- Phasing guidance within this spec’s delivery: Assembled prompt wired to Provider → token budget + tool clearing → deterministic Summary + Root set → Pinned auto policy → Project instructions → Context inventory + snapshots → Task soft-continue rules; model Summary writer and model pin tools remain later/compatible extensions called out in Out of Scope if not completed in the first cut.

## Testing Decisions

- Good tests assert externally visible behavior, not private helpers: what the Provider received, what Session snapshot exposes, whether Compaction preserved Root set members, inventory command output shape, and event-visible assembly/compaction signals. Exact Summary wording is not an assertion target.
- Primary seam: HarnessSession / HarnessRuntime with ScriptedProvider (extend existing harness runtime tests). Capture or instrument Provider `sendTurn` inputs to prove Assembled prompt ≠ full Transcript.
- Assert Compaction under forced small token budgets using oversized tool results / many Turns; assert tool clearing happens before or without requiring Summary when clearing alone is enough; assert Root set survival after Summary Compaction.
- Assert Task vs Plan separation and REPL soft-continue / hard-switch / high-confidence replace at the HarnessSession seam.
- Secondary seam: CLI/REPL Context inventory command output; Session `clear` continuity where it intersects context reset.
- Prior art: `harness.test.ts` for runtime + ScriptedProvider; `cli.test.ts` for Command/REPL process behavior; prefer these styles over deep unit mocks of internal assemblers.
- Do not require live Provider `count_tokens` APIs in CI; heuristic metering must be sufficient for Compaction tests.
- Eval entrypoint should remain green with ScriptedProvider under the new assembly path.

## Out of Scope

- Full Claude Code compaction cascade (snip tiers, session-memory free summaries, fork summarizer agent, reactive 413 recovery loops) as a required v1 deliverable
- Model-authored Summary writer (allowed later under the same contract; not required to close this PRD)
- Model-facing pin/unpin Tools (dual-channel contract is reserved; v1 is Harness-automatic pin only)
- Writable long-term memory / auto-memory distillation across Sessions
- Multi-agent context isolation and sub-agent context sandboxes
- Server-side Provider compaction APIs as the primary mechanism (Harness owns Compaction)
- GUI/TUI Context visualization beyond Session command text output and persisted structural snapshots
- Perfect NLP Task-boundary classification; only high-confidence heuristics plus user-forced switch are in scope
- Changing Provider wire formats (OpenAI-compatible vs scripted) beyond consuming Assembled prompt consistently
- Organization policy packs or enterprise memory hierarchies

## Further Notes

- This PRD implements the decisions locked in the context-engineering grilling session and recorded in ADR-0003.
- Educational clarity beats feature breadth: two-stage Compaction and inspectability matter more than matching any single commercial harness.
- When naming user-facing commands and log fields, prefer glossary terms (Context inventory, Assembled prompt, Compaction, Root set) over synonyms avoided in `CONTEXT.md`.
- If delivery is sliced into multiple implementation issues under this feature directory, keep the HarnessSession Assembled-prompt seam as the single primary test surface across slices.
