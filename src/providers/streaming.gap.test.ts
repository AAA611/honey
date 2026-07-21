/**
 * Feedback loop for: no streaming assistant response.
 *
 * User symptom: tokens do not appear incrementally; the full assistant
 * message only shows after the Turn completes.
 *
 * This loop asserts the first load-bearing wire decision: the OpenAI-compatible
 * Provider must request SSE (`stream: true`). Today ADR-0002 hardcodes false.
 *
 * Command (expect RED until streaming ships):
 *   npx vitest run src/providers/streaming.gap.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleProvider,
  type HttpTransport
} from "./openAiCompatibleProvider.js";

describe("streaming gap — Provider wire", () => {
  // Known gap (ADR-0002). Remove `.fails` when stream:true + SSE parsing land.
  it.fails("requests stream:true so token deltas can reach the Session", async () => {
    let capturedBody: unknown;
    const transport: HttpTransport = async (_url, init) => {
      capturedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "hi" }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      transport
    });

    await provider.sendTurn({
      systemPrompt: "You are honey.",
      messages: [{ role: "user", content: "hi" }],
      tools: []
    });

    expect(capturedBody).toMatchObject({ stream: true });
  });
});
