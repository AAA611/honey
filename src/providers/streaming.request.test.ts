/**
 * Documents ADR-0002: OpenAI-compatible Provider v1 is non-streaming.
 * When streaming lands, flip this assertion and add SSE parsing coverage.
 *
 * Command:
 *   npx vitest run src/providers/streaming.request.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleProvider,
  type HttpTransport
} from "./openAiCompatibleProvider.js";

describe("OpenAI-compatible Provider streaming request", () => {
  it("sends stream:false (ADR-0002 v1 non-streaming)", async () => {
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

    expect(capturedBody).toMatchObject({ stream: false });
  });
});
