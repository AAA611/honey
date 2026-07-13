# Local CLI Harness V0 Spec

Status: local draft only. The repository currently has no configured issue tracker or triage workflow, so this spec has not been published and no `ready-for-agent` label has been applied.

## Problem Statement

The user wants to learn how a Claude Code or Codex style harness is built by implementing one from scratch. The goal is not to clone every product feature, but to build a real local CLI harness that exercises the same core engineering problems: model orchestration, tool calling, environment interaction, safety boundaries, context management, structured editing, and evaluation.

The user specifically wants a version that is close enough to these products to teach the important harness concepts, while staying small enough to build and reason about from zero to one.

## Solution

Build a local CLI, single-agent, TypeScript harness with a deliberately narrow first version:

- One model backend behind an extensible provider interface
- An explicit runtime state machine rather than a free-form text loop
- Structured JSON tool calling
- A minimal core toolset for reading/searching files, running commands, applying patches, and running tests
- Session-based command execution with PTY-like incremental interaction
- Patch-first editing with whole-file replacement only as a fallback
- Safe, guarded, and blocked execution classes
- Layered context management with summarization and trimming
- A lightweight explicit plan
- Structured event logging
- A minimal eval and fixture suite

This version should be treated as a learning harness with real runtime boundaries, not as a toy demo or a production multi-agent platform.

## User Stories

1. As a learner building an agent harness, I want a local CLI entrypoint, so that I can run the system end to end without depending on an IDE or web app.
2. As a learner building an agent harness, I want the first version to use a single agent, so that I can understand the core execution loop before introducing orchestration complexity.
3. As a learner building an agent harness, I want the model integration behind a provider abstraction, so that I can learn which parts belong to the provider and which belong to the runtime.
4. As a learner building an agent harness, I want the runtime to use explicit states, so that I can reason about control flow and insert approvals, retries, and error handling at stable boundaries.
5. As a learner building an agent harness, I want the model to call tools through structured JSON, so that tool invocation is parseable, validated, and portable across providers.
6. As a learner building an agent harness, I want the harness to expose file reading and searching tools, so that the agent can inspect a workspace before acting.
7. As a learner building an agent harness, I want the harness to expose command execution tools, so that the agent can inspect, build, and test code in a realistic way.
8. As a learner building an agent harness, I want command execution to support long-lived sessions, so that the agent can handle streaming output and interactive workflows.
9. As a learner building an agent harness, I want the harness to prefer patch-based editing, so that changes are incremental, auditable, and easier to recover from.
10. As a learner building an agent harness, I want whole-file replacement to exist only as a fallback, so that the common path stays close to real agent editing behavior.
11. As a learner building an agent harness, I want the harness to classify actions as safe, guarded, or blocked, so that the model cannot directly control the full machine without policy boundaries.
12. As a learner building an agent harness, I want the harness to keep a layered context, so that long tasks do not degrade as raw transcript size grows.
13. As a learner building an agent harness, I want earlier turns to be summarized, so that the agent can retain decisions without carrying every raw detail forever.
14. As a learner building an agent harness, I want an explicit plan object, so that task progress survives trimming and does not live only in model memory.
15. As a learner building an agent harness, I want each turn to emit structured events, so that I can inspect why the agent succeeded or failed.
16. As a learner building an agent harness, I want to record tool inputs and results, so that debugging does not rely on guesswork.
17. As a learner building an agent harness, I want minimal eval fixtures, so that I can detect regressions in tool choice, editing, and recovery behavior.
18. As a learner building an agent harness, I want the codebase split by runtime concerns, so that I can study the architecture rather than a single tangled file.
19. As a learner building an agent harness, I want the first version to stay local-only, so that I can focus on harness fundamentals instead of distributed systems concerns.
20. As a learner building an agent harness, I want the first version to avoid browser automation and network tools, so that I can defer broader risk surfaces until the core loop is stable.
21. As a developer using the harness, I want the agent to stop cleanly in terminal states, so that runs do not hang after the model finishes.
22. As a developer using the harness, I want errors to be surfaced as structured runtime outcomes, so that failed runs can be inspected and retried consistently.
23. As a developer using the harness, I want tool schemas to be normalized, so that the runtime can stay stable even if provider APIs differ.
24. As a developer using the harness, I want the harness to own policy decisions, so that safety is enforced by code rather than prompt wording.
25. As a developer using the harness, I want tests to target the highest seams, so that the implementation can evolve without rewriting fragile internals-focused tests.

## Implementation Decisions

- The first version is a local CLI harness and intentionally excludes GUI, IDE embedding, remote orchestration, and multi-agent behavior.
- The implementation language is TypeScript.
- The runtime will be built around an explicit state machine with at least the following states: `USER_INPUT`, `MODEL_TURN`, `TOOL_DISPATCH`, `TOOL_RESULT`, `DONE`, and `ERROR`.
- The system will integrate one model provider initially, but the provider contract will be defined as an internal abstraction rather than binding the runtime directly to a single SDK.
- The provider layer will normalize model turn requests, streaming or non-streaming responses, tool calls, stop reasons, and token usage into a runtime-owned format.
- Tool invocation will use structured JSON rather than custom XML or tag-based parsing.
- The first toolset will stay intentionally narrow and cover only the minimum core loop:
  - File reading and workspace search
  - Command execution with session support
  - Patch-based editing
  - Test execution
- Command execution will support a minimal session model, including session creation, incremental output retrieval, optional stdin writes, termination, working directory selection, timeout handling, and exit status capture.
- Editing will follow a patch-first flow: inspect, propose a change, validate the patch shape, apply it, and return structured success or failure. Whole-file replacement may exist only as a fallback path.
- Safety policy will be enforced by the harness rather than by prompt text. Commands and tools will be categorized as safe, guarded, or blocked.
- Safe actions will execute directly. Guarded actions will require a harness approval checkpoint or explicit confirmation path. Blocked actions will be rejected by policy.
- Context will be layered rather than transcript-only. The minimum layers are:
  - Stable system instructions and policy
  - Current task and acceptance framing
  - Active working set of recent turns, tool outputs, and relevant file excerpts
  - Summarized historical decisions and failures
- The runtime will own trimming and summarization decisions rather than relying on the model to infer what should be dropped.
- A lightweight plan object will be maintained explicitly with a goal and step list, using simple statuses such as pending, in progress, and done.
- Structured event logging will be built into the runtime from the start. The minimum event families are run lifecycle, turn lifecycle, provider request and response, tool call and result, state transitions, plan updates, and errors.
- The first version will record events for inspection but will not attempt to ship a full replay engine.
- The initial project structure will follow runtime boundaries rather than collapsing everything into a single file. The minimum module groupings are provider, runtime, tools, context, planning, logging, and evals.
- Development should proceed in this order:
  - Provider contract and tool-calling schema
  - Runtime state machine
  - Read/search and session-based command execution
  - Patch editing pipeline
  - Context layering and summarization
  - Planning
  - Event logging
  - Eval fixtures
  - Additional guardrails

## Testing Decisions

- Good tests should assert externally visible behavior rather than internal implementation details. For this harness, that means validating state transitions, emitted events, selected tools, produced file changes, command outcomes, and final run status rather than private method structure.
- The highest seams should be preferred. The main seam should be the runtime run loop operating against provider and tool interfaces. Lower-level unit tests should exist only where they protect stable parsing, validation, or policy behavior.
- The first eval suite will focus on three fixture families:
  - Tool-use fixtures that verify whether the runtime and provider path lead to the expected tool choice
  - Edit fixtures that verify whether a simple workspace task produces the correct patch and final file state
  - Recovery fixtures that verify whether the runtime can continue or fail cleanly after tool errors, malformed calls, or blocked actions
- Provider normalization should be tested at the interface boundary using mocked provider responses, especially around tool-call extraction, stop reasons, and error mapping.
- Tool policy classification should be tested as deterministic logic independent of the model.
- Patch validation and application should be tested against both happy-path and rejection cases, including malformed patches and stale-context failures.
- Context trimming and summarization should be tested by observable outcomes such as preserved task state and retained decisions, not by exact summary wording.
- Event logging should be tested for completeness and structural correctness so that each run produces a coherent timeline with consistent identifiers.
- There is currently no prior art in this repository because the repository is empty. The initial tests will therefore define the project's testing style and should favor small fixtures and high-seam runtime tests over deep internal mocks.

## Out of Scope

- Multi-agent orchestration
- GUI, TUI, or IDE integration
- Browser automation
- Network-enabled tools
- Git write operations as first-class agent tools
- Background job scheduling
- Long-term memory systems
- Organization-scale approval workflows
- Full event replay infrastructure
- Complex task DAGs or dependency graphs
- Broad provider matrix support in the first version
- Production hardening beyond the minimum guardrails required to safely study the architecture

## Further Notes

- The purpose of this project is educational through implementation. Decisions should therefore optimize for clarity of architecture and observability of behavior, not for maximum feature breadth.
- The product being built is not a generic chatbot shell. Its identity comes from the runtime loop, tool protocol, context governance, safety policy, editing model, and evaluation harness.
- The first version should be treated as a reference architecture for learning, with enough realism that future extensions such as additional providers, richer approvals, or more tools can be layered on without redesigning the foundations.
