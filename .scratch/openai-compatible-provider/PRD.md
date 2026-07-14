# PRD: OpenAI-Compatible Provider (DeepSeek Preset)

Status: ready-for-agent

## Problem Statement

Honey only speaks through a scripted Provider, so a Run never hits a real model. I want honey to work like a small Claude Code–style harness that I can point at DeepSeek: explicitly opt in, use an OpenAI-compatible wire format, complete real Tool loops in Command mode and REPL mode, and keep the existing Harness runtime untouched except for how the Provider is chosen.

## Solution

Add a generic OpenAI Chat Completions–compatible Provider behind honey’s existing Provider seam. Ship a DeepSeek preset (default base URL and model) selectable via CLI, configured from environment variables and flag overrides. Default remains the scripted Provider. Guarded Tools stay off unless explicitly allowed. Automated tests inject a fake HTTP transport; live DeepSeek smoke stays optional and out of CI.

## User Stories

1. As a honey user, I want to keep the default CLI on the scripted Provider, so that demo and local use never call the network by accident.
2. As a honey user, I want to pass `--provider deepseek` in Command mode, so that one prompt runs against DeepSeek instead of the scripted backend.
3. As a honey user, I want to pass `--provider deepseek` in REPL mode, so that a Session’s repeated Turns use DeepSeek for the whole Session.
4. As a honey user, I want DeepSeek to default to base URL `https://api.deepseek.com`, so that I do not have to memorize the endpoint for the common case.
5. As a honey user, I want DeepSeek to default to model `deepseek-v4-flash`, so that the preset matches the model I intend to use.
6. As a honey user, I want to override the model with a CLI flag, so that I can try another DeepSeek (or compatible) model id without changing code.
7. As a honey user, I want to override the model with an environment variable, so that my shell profile can pin a default for explicit DeepSeek runs.
8. As a honey user, I want to override the base URL with a CLI flag, so that I can point honey at a gateway or proxy.
9. As a honey user, I want to override the base URL with an environment variable, so that team/proxy defaults stay out of the command line.
10. As a honey user, I want honey to read `DEEPSEEK_API_KEY` first when using the DeepSeek preset, so that vendor-named credentials feel natural.
11. As a honey user, I want honey to fall back to `HONEY_API_KEY` if `DEEPSEEK_API_KEY` is missing, so that a single honey-scoped secret still works.
12. As a honey user, I want an explicit clear error when I select DeepSeek but no API key is available, so that I am not left with a silent scripted Run.
13. As a honey user, I want guarded Tools to remain disabled by default even with DeepSeek selected, so that a live model cannot exec or patch without my consent.
14. As a honey user, I want `--allow-guarded-tools` to enable guarded Tools for that process, so that a real coding agent loop can apply patches and run commands when I opt in.
15. As a honey user, I want a Turn against DeepSeek to return assistant text through the same Run output path as today, so that Command mode and REPL printing stay familiar.
16. As a honey user, I want DeepSeek tool calls to drive the existing Tool dispatch loop, so that Harness state transitions and events stay valid.
17. As a honey user, I want Tool results from honey to be sent back on the next Provider Turn in an OpenAI-compatible message shape, so that multi-Turn tool use actually completes.
18. As a honey user, I want Provider-reported token usage (when present) to appear in model_response events the same way optional usage does today, so that logging stays consistent.
19. As a honey user, I want HTTP/API failures to surface as a failed Turn/Run with a readable error rather than hanging, so that I can fix credentials, model id, or network issues.
20. As a honey user, I want unknown or malformed tool call payloads from the model to fail safely inside the Provider/Harness path, so that bad JSON does not crash the process without explanation.
21. As a developer extending honey, I want the live backend to be a generic OpenAI-compatible Provider, so that another compatible vendor is mostly configuration, not a new protocol class.
22. As a developer extending honey, I want a DeepSeek preset to only supply defaults (name, base URL, model, key env order), so that vendor-specific code stays thin.
23. As a developer extending honey, I want a future `--provider openai-compatible` path to reuse the same Provider implementation, even if v1 only ships `scripted` and `deepseek` on the CLI.
24. As a developer of honey, I want the Harness to keep calling `Provider.sendTurn` with the existing request/response types, so that the runtime learning surface does not fork for live models.
25. As a developer of honey, I want the OpenAI-compatible Provider to accept an injected HTTP transport, so that tests never need a real network.
26. As a developer of honey, I want contract tests that feed OpenAI-shaped JSON (including tool_calls) and assert honey `ProviderTurnResponse` mapping, so that adapter regressions are caught in CI.
27. As a developer of honey, I want contract tests that assert the outgoing request includes model, messages, and tools in Chat Completions shape, so that request mapping stays honest.
28. As a developer of honey, I want CLI tests covering provider selection and allow-guarded-tools wiring without live HTTP, so that opt-in behavior does not regress.
29. As a developer of honey, I want ScriptedProvider tests and Harness tests to keep working unchanged in spirit, so that the learning harness baseline remains green.
30. As a maintainer, I want this design documented by ADR-0002, so that future contributors do not “fix” honey onto Anthropic Messages or a vendor SDK without revisiting the decision.
31. As a user comparing to Claude Code, I want “third-party model” to mean pluggable Provider + base URL/model/key, so that I learn the harness seam rather than copying Anthropic’s wire format.
32. As a user running evals, I want the eval entrypoint to remain on ScriptedProvider unless explicitly changed later, so that offline evals stay deterministic.
33. As a user without streaming, I want a full completion per Turn, so that v1 behavior matches the non-streaming decision and existing Turn semantics.
34. As a user who mistypes `--provider`, I want a clear rejection of unknown provider names, so that I do not silently fall back to scripted.
35. As a user who sets DeepSeek flags while leaving provider as scripted, I want scripted behavior to win unless provider is explicitly deepseek, so that flags alone never trigger live calls.

## Implementation Decisions

- Respect ADR-0002: OpenAI Chat Completions–compatible HTTP is the third-party integration path; DeepSeek is a preset, not a separate protocol.
- Keep the existing **Provider** interface as the sole runtime seam: `sendTurn(ProviderTurnRequest) → ProviderTurnResponse`. Do not introduce streaming events into the Harness for this feature.
- Implement a generic OpenAI-compatible Provider that maps:
  - honey system prompt + conversation messages + tool definitions → Chat Completions request body
  - Chat Completions message / `tool_calls` / finish reason / usage → honey assistant message, `ToolCall[]`, `stopReason`, optional `TokenUsage`
- Inject HTTP transport (fetch-like or equivalent) into the Provider for testability; production wiring uses real HTTP.
- DeepSeek preset defaults: base URL `https://api.deepseek.com`, model `deepseek-v4-flash`, Provider name suitable for logs/events (e.g. preset id `deepseek`).
- Credential resolution for DeepSeek: `DEEPSEEK_API_KEY`, then `HONEY_API_KEY`; missing key with DeepSeek selected is a hard error.
- CLI: default provider remains `scripted`. Accept explicit `--provider deepseek`. Allow overrides for model and base URL via flags and env (`HONEY_MODEL` / `HONEY_BASE_URL` or equivalent names consistent with the grilling lock). Unknown provider names fail fast.
- CLI: `--allow-guarded-tools` sets `allowGuardedTools` on Harness config; default remains `false` for all providers including DeepSeek.
- Command mode and REPL mode must both honor the same provider/config construction path so Session Turns and one-shot Runs stay consistent.
- v1 CLI may ship only `scripted` | `deepseek`; structure the generic Provider so `openai-compatible` can be added later without rewriting mapping.
- No config file; no secrets on disk; no Anthropic Messages client; no vendor SDK as the primary layer; no silent fallback between scripted and live.
- Eval runner stays on ScriptedProvider unless a follow-up explicitly changes it.
- Domain vocabulary: Harness, Provider, Tool, Run, Turn, Session, REPL mode, Command mode — per `CONTEXT.md`. Do not invent Stream or Model glossary terms for this cut.

## Testing Decisions

- Good tests assert externally observable behavior at agreed seams: Provider turn mapping via injected transport, and CLI construction/selection behavior — not private helpers or exact HTTP client libraries.
- Primary module under test: OpenAI-compatible Provider (request mapping, response mapping, auth headers, error surfacing) with fake transport.
- Secondary module under test: CLI provider/config wiring (explicit deepseek vs default scripted; allow-guarded-tools; missing key error when deepseek selected). Prefer the existing CLI process-spawn style where practical; unit-level construction helpers are acceptable if the CLI process seam is too coarse for env/flag matrix.
- Prior art: `scriptedProvider` tests for Provider behavior; `cli.test.ts` for Command/REPL CLI seam; `harness.test.ts` for runtime with an injected Provider (reuse ScriptedProvider, do not require live DeepSeek in Harness tests).
- Out of CI: live DeepSeek smoke. If documented, it must be clearly manual/optional.
- Do not require Harness behavior changes to land this feature; if a Harness test is added, it should only prove an injected OpenAI-compatible Provider (with fake transport) can complete a Tool loop like ScriptedProvider does.

## Out of Scope

- Streaming / SSE / partial Tool call assembly in the Harness
- Local or project config files (`~/.honey`, `.honey.json`, etc.)
- Anthropic Messages API shape or Anthropic-compatible base URL as the primary path
- Vendor SDKs as the integration layer
- Implementing `--provider openai-compatible` on the CLI in v1 (design leftover is enough)
- Changing default provider to live; silent credentials fallback to scripted
- Raising `allowGuardedTools` by default for live providers
- Multi-agent, provider matrix UIs, cost dashboards, or rate-limit policymaking beyond basic error surfacing
- Updating evals to call DeepSeek by default
- CONTEXT.md glossary expansion unless a new stable domain term becomes necessary (none expected)

## Further Notes

- Shared understanding and ADR locked in grilling; this PRD is the implementation brief for that decision set.
- Acceptance for “works”: with `--provider deepseek`, valid credentials, and `--allow-guarded-tools` when Tools need it, a user Task can complete a real model Turn and Tool loop end-to-end. Extensibility is validated by the generic Provider + fake-transport tests, not by shipping a second vendor in v1.
- Suggested verification command shape (manual smoke, not CI):  
  `honey --provider deepseek --allow-guarded-tools "read CONTEXT.md and summarize"`  
  with `DEEPSEEK_API_KEY` set.
- Issue tracker path for this feature: `.scratch/openai-compatible-provider/PRD.md`.
