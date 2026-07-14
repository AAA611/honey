import { describe, expect, it } from "vitest";
import { createCliRuntime, parseCliArgs } from "./cliConfig.js";
import { ScriptedProvider } from "./providers/scriptedProvider.js";
import { OpenAiCompatibleProvider } from "./providers/openAiCompatibleProvider.js";

describe("CLI config seam", () => {
  it("defaults to scripted provider and guarded tools off", () => {
    const args = parseCliArgs([]);
    expect(args).toEqual({
      provider: "scripted",
      allowGuardedTools: false,
      model: undefined,
      baseUrl: undefined,
      prompt: ""
    });

    const runtime = createCliRuntime(args, {});
    expect(runtime.provider).toBeInstanceOf(ScriptedProvider);
    expect(runtime.allowGuardedTools).toBe(false);
  });

  it("selects DeepSeek preset with defaults and DEEPSEEK_API_KEY", () => {
    const args = parseCliArgs(["--provider", "deepseek", "hello"]);
    expect(args.provider).toBe("deepseek");
    expect(args.prompt).toBe("hello");

    const runtime = createCliRuntime(args, {
      DEEPSEEK_API_KEY: "sk-deepseek"
    });
    expect(runtime.provider).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(runtime.provider.name).toBe("deepseek");
    expect(runtime.model).toBe("deepseek-v4-flash");
    expect(runtime.baseUrl).toBe("https://api.deepseek.com");
  });

  it("falls back to HONEY_API_KEY for DeepSeek", () => {
    const args = parseCliArgs(["--provider", "deepseek"]);
    const runtime = createCliRuntime(args, { HONEY_API_KEY: "sk-honey" });
    expect(runtime.provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it("prefers DEEPSEEK_API_KEY over HONEY_API_KEY", async () => {
    const args = parseCliArgs(["--provider", "deepseek"]);
    let seenAuth = "";
    const runtime = createCliRuntime(
      args,
      {
        DEEPSEEK_API_KEY: "sk-deepseek",
        HONEY_API_KEY: "sk-honey"
      },
      {
        transport: async (_url, init) => {
          const headers = init.headers as Record<string, string>;
          seenAuth = headers.authorization;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: { role: "assistant", content: "ok" }
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    );

    await runtime.provider.sendTurn({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: []
    });
    expect(seenAuth).toBe("Bearer sk-deepseek");
  });

  it("overrides model and base URL from flags and env", () => {
    const fromFlags = createCliRuntime(
      parseCliArgs([
        "--provider",
        "deepseek",
        "--model",
        "custom-model",
        "--base-url",
        "https://gateway.example"
      ]),
      { DEEPSEEK_API_KEY: "sk" }
    );
    expect(fromFlags.model).toBe("custom-model");
    expect(fromFlags.baseUrl).toBe("https://gateway.example");

    const fromEnv = createCliRuntime(parseCliArgs(["--provider", "deepseek"]), {
      DEEPSEEK_API_KEY: "sk",
      HONEY_MODEL: "env-model",
      HONEY_BASE_URL: "https://env.example"
    });
    expect(fromEnv.model).toBe("env-model");
    expect(fromEnv.baseUrl).toBe("https://env.example");
  });

  it("enables guarded tools only when the flag is present", () => {
    const off = createCliRuntime(parseCliArgs(["--provider", "scripted"]), {});
    expect(off.allowGuardedTools).toBe(false);

    const on = createCliRuntime(
      parseCliArgs(["--allow-guarded-tools", "--provider", "deepseek"]),
      { DEEPSEEK_API_KEY: "sk" }
    );
    expect(on.allowGuardedTools).toBe(true);
  });

  it("fails when DeepSeek is selected without an API key", () => {
    expect(() =>
      createCliRuntime(parseCliArgs(["--provider", "deepseek"]), {})
    ).toThrow(/API_KEY/);
  });

  it("rejects unknown providers", () => {
    expect(() => parseCliArgs(["--provider", "anthropic"])).toThrow(
      /Unknown provider/
    );
  });

  it("keeps scripted when provider is not deepseek even if model flags are set", () => {
    const runtime = createCliRuntime(
      parseCliArgs(["--model", "deepseek-v4-flash", "prompt"]),
      { DEEPSEEK_API_KEY: "sk" }
    );
    expect(runtime.provider).toBeInstanceOf(ScriptedProvider);
    expect(runtime.prompt).toBe("prompt");
  });
});
