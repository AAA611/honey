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
      dumpPrompts: false,
      dumpPromptsDir: undefined,
      sessionEventLog: true,
      sessionEventLogDir: undefined,
      model: undefined,
      baseUrl: undefined,
      prompt: ""
    });

    const runtime = createCliRuntime(args, {});
    expect(runtime.provider).toBeInstanceOf(ScriptedProvider);
    expect(runtime.allowGuardedTools).toBe(false);
    expect(runtime.dumpPrompts).toBe(false);
    expect(runtime.sessionEventLog).toBe(true);
  });

  it("enables prompt dumps from flag or HONEY_DUMP_PROMPTS", () => {
    const fromFlag = createCliRuntime(parseCliArgs(["--dump-prompts"]), {});
    expect(fromFlag.dumpPrompts).toBe(true);

    const fromDir = parseCliArgs(["--dump-prompts-dir", "/tmp/honey-dumps"]);
    expect(fromDir.dumpPrompts).toBe(true);
    expect(fromDir.dumpPromptsDir).toBe("/tmp/honey-dumps");

    const fromEnv = createCliRuntime(parseCliArgs([]), {
      HONEY_DUMP_PROMPTS: "1",
      HONEY_DUMP_PROMPTS_DIR: "/tmp/from-env"
    });
    expect(fromEnv.dumpPrompts).toBe(true);
    expect(fromEnv.dumpPromptsDir).toBe("/tmp/from-env");
  });

  it("defaults Session event log on and supports disable or directory override", () => {
    const defaults = createCliRuntime(parseCliArgs([]), {});
    expect(defaults.sessionEventLog).toBe(true);
    expect(defaults.sessionEventLogDir).toBeUndefined();

    const disabled = createCliRuntime(parseCliArgs(["--no-session-event-log"]), {});
    expect(disabled.sessionEventLog).toBe(false);

    const fromDir = parseCliArgs([
      "--session-event-log-dir",
      "/tmp/honey-session-logs"
    ]);
    expect(fromDir.sessionEventLog).toBe(true);
    expect(fromDir.sessionEventLogDir).toBe("/tmp/honey-session-logs");

    const fromEnv = createCliRuntime(parseCliArgs([]), {
      HONEY_SESSION_EVENT_LOG: "0",
      HONEY_SESSION_EVENT_LOG_DIR: "/tmp/from-env-logs"
    });
    expect(fromEnv.sessionEventLog).toBe(false);
    expect(fromEnv.sessionEventLogDir).toBe("/tmp/from-env-logs");

    const dirFromEnv = createCliRuntime(parseCliArgs([]), {
      HONEY_SESSION_EVENT_LOG_DIR: "/tmp/only-dir"
    });
    expect(dirFromEnv.sessionEventLog).toBe(true);
    expect(dirFromEnv.sessionEventLogDir).toBe("/tmp/only-dir");
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
