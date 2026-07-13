import { describe, expect, it } from "vitest";
import { ScriptedProvider } from "./scriptedProvider.js";

describe("ScriptedProvider", () => {
  it("requests a workspace search when the prompt asks for search", async () => {
    const provider = new ScriptedProvider();
    const response = await provider.sendTurn({
      systemPrompt: "test",
      messages: [{ role: "user", content: "search: harness" }],
      tools: []
    });

    expect(response.stopReason).toBe("tool_calls");
    expect(response.toolCalls[0]?.toolName).toBe("search_workspace");
  });
});
