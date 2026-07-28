import { describe, expect, it, vi } from "vitest";
import { appendWorkingMessages, createContextLayers } from "../context/layers.js";
import { EventLogger } from "../logging/eventLogger.js";
import { createExecutionStepChecklist } from "../planning/plan.js";
import type {
  ConversationMessage,
  Provider,
  ProviderTurnRequest,
  ProviderTurnResponse,
  ToolCall,
  ToolDefinition
} from "../types.js";
import { runTurnLoop, type TurnLoopScope } from "./turnLoop.js";

function baseScope(
  overrides: Partial<TurnLoopScope> & {
    provider: Provider;
  }
): TurnLoopScope {
  const context = createContextLayers({
    system: "system",
    task: "Goal: test"
  });
  const withUser = appendWorkingMessages(context, [
    { role: "user", content: "hello" }
  ]);
  return {
    logger: new EventLogger({ sessionId: "s1" }),
    turnId: "t1",
    maxTurns: 4,
    tokenBudget: 100_000,
    tools: [],
    refetchableToolNames: new Set(),
    context: withUser,
    stepChecklist: createExecutionStepChecklist("hello"),
    getPlanMode: () => false,
    getPlanDocument: () => null,
    executeTool: async () => ({ ok: true, content: "ok" }),
    ...overrides
  };
}

describe("runTurnLoop", () => {
  it("completes when Provider returns stopReason completed", async () => {
    const provider: Provider = {
      name: "test",
      async sendTurn(): Promise<ProviderTurnResponse> {
        return {
          assistantMessage: { role: "assistant", content: "done" },
          toolCalls: [],
          stopReason: "completed"
        };
      }
    };

    const scope = baseScope({ provider });
    const result = await runTurnLoop(scope);

    expect(result.finalState).toBe("DONE");
    expect(result.output).toBe("done");
    expect(scope.context.workingSet.some((m) => m.role === "assistant")).toBe(
      true
    );
    expect(scope.stepChecklist.steps.every((s) => s.status === "done")).toBe(
      true
    );
  });

  it("dispatches tools then completes on the next Turn", async () => {
    let calls = 0;
    const toolCall: ToolCall = {
      callId: "c1",
      toolName: "read_file",
      arguments: { path: "a.txt" }
    };
    const provider: Provider = {
      name: "test",
      async sendTurn(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
        calls += 1;
        if (calls === 1) {
          return { toolCalls: [toolCall], stopReason: "tool_calls" };
        }
        const last = request.messages[request.messages.length - 1];
        expect(last?.role).toBe("tool");
        return {
          assistantMessage: { role: "assistant", content: "after tool" },
          toolCalls: [],
          stopReason: "completed"
        };
      }
    };

    const executeTool = vi.fn(async () => ({
      ok: true,
      content: "file body"
    }));

    const transcript: ConversationMessage[] = [
      { role: "user", content: "hello" }
    ];
    const scope = baseScope({
      provider,
      tools: [
        {
          name: "read_file",
          description: "read",
          risk: "safe",
          inputSchema: {}
        } satisfies ToolDefinition
      ],
      executeTool,
      transcript
    });

    const result = await runTurnLoop(scope);

    expect(executeTool).toHaveBeenCalledWith(toolCall);
    expect(result.finalState).toBe("DONE");
    expect(result.output).toBe("after tool");
    expect(transcript.some((m) => m.role === "tool")).toBe(true);
  });

  it("errors when maxTurns is exhausted", async () => {
    const provider: Provider = {
      name: "test",
      async sendTurn(): Promise<ProviderTurnResponse> {
        return {
          toolCalls: [
            {
              callId: "c1",
              toolName: "read_file",
              arguments: {}
            }
          ],
          stopReason: "tool_calls"
        };
      }
    };

    const scope = baseScope({
      provider,
      maxTurns: 1,
      executeTool: async () => ({ ok: true, content: "x" })
    });

    const result = await runTurnLoop(scope);
    expect(result.finalState).toBe("ERROR");
    expect(result.output).toMatch(/max turn limit/i);
  });
});
