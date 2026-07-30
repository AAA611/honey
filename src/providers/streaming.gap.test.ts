/**
 * Feedback loop for: streaming assistant response via streamTurn.
 *
 * Command:
 *   npx vitest run src/providers/streaming.gap.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleProvider,
  type HttpTransport
} from "./openAiCompatibleProvider.js";

describe("streaming — Provider streamTurn wire", () => {
  it("requests stream:true so token deltas can reach the Session", async () => {
    let capturedBody: unknown;
    const transport: HttpTransport = async (_url, init) => {
      capturedBody = JSON.parse(String(init.body));
      const sse = [
        'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}',
        "data: [DONE]",
        ""
      ].join("\n");
      return new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    };

    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      transport
    });

    await provider.streamTurn(
      {
        systemPrompt: "You are honey.",
        messages: [{ role: "user", content: "hi" }],
        tools: []
      },
      () => undefined
    );

    expect(capturedBody).toMatchObject({ stream: true });
  });
});
