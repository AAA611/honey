# ADR-0002: OpenAI-Compatible Provider for Third-Party Models

## Status

Accepted

## Context

Honey already has a **Provider** seam (`sendTurn` → runtime-owned turn shapes) but only a `ScriptedProvider`. The next learning cut is to run a real coding-agent loop against a third-party model, starting with DeepSeek, without pretending Anthropic Messages is the wire format DeepSeek speaks.

## Decision

Third-party models integrate through a generic **OpenAI Chat Completions–compatible** HTTP Provider. DeepSeek is the first **preset** (defaults: base `https://api.deepseek.com`, model `deepseek-v4-flash`), not a vendor-specific protocol class.

Locked constraints for the first cut:

- Config is environment variables plus CLI overrides; no config file; secrets stay in env (`DEEPSEEK_API_KEY`, then `HONEY_API_KEY`).
- CLI defaults to `scripted`; real calls require an explicit provider (e.g. `--provider deepseek`). A generic `openai-compatible` preset may follow; v1 may ship only `scripted` | `deepseek`.
- v1 is non-streaming: adapters fill the existing `ProviderTurnResponse` contract.
- `allowGuardedTools` stays off by default even with a real provider; callers must pass `--allow-guarded-tools`.
- Automated tests fake HTTP/transport; live DeepSeek smoke stays optional and out of CI.

## Consequences

### Positive

- Matches DeepSeek’s actual API surface and keeps the Provider seam as the only runtime boundary.
- One adapter skeleton can serve later OpenAI-compatible backends via base URL / model / key.
- Explicit opt-in avoids surprising network calls and unpaid guarded tool use in a learning repo.

### Negative

- Does not mirror Claude Code’s Anthropic Messages wire format; the analogy is “pluggable backend,” not “copy Anthropic HTTP.”
- Streaming UX and config-file workflows are deferred; first real-model experience is request/response and flag-heavy.

## Rejected alternatives

- Anthropic Messages–shaped client or base-URL swap aimed at Anthropic compatibility.
- Vendor SDK as the primary integration layer.
- Silent fallback from missing credentials to a live provider (or the reverse: live by default).
