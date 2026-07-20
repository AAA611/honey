import type { Provider } from "./types.js";
import {
  OpenAiCompatibleProvider,
  type HttpTransport
} from "./providers/openAiCompatibleProvider.js";
import { ScriptedProvider } from "./providers/scriptedProvider.js";

export type CliProviderName = "scripted" | "deepseek";

export interface ParsedCliArgs {
  provider: CliProviderName;
  allowGuardedTools: boolean;
  mcp: boolean;
  dumpPrompts: boolean;
  dumpPromptsDir?: string;
  sessionEventLog: boolean;
  sessionEventLogDir?: string;
  model?: string;
  baseUrl?: string;
  prompt: string;
}

export interface CliRuntimeConfig {
  provider: Provider;
  allowGuardedTools: boolean;
  mcp: boolean;
  dumpPrompts: boolean;
  dumpPromptsDir?: string;
  sessionEventLog: boolean;
  sessionEventLogDir?: string;
  model?: string;
  baseUrl?: string;
  prompt: string;
}

export interface CreateCliRuntimeOptions {
  transport?: HttpTransport;
}

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  let provider: CliProviderName = "scripted";
  let allowGuardedTools = false;
  let mcp = false;
  let dumpPrompts = false;
  let dumpPromptsDir: string | undefined;
  let sessionEventLog = true;
  let sessionEventLogDir: string | undefined;
  let model: string | undefined;
  let baseUrl: string | undefined;
  const promptParts: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--provider") {
      const value = argv[++i];
      if (value !== "scripted" && value !== "deepseek") {
        throw new Error(
          `Unknown provider "${value ?? ""}". Supported: scripted, deepseek.`
        );
      }
      provider = value;
      continue;
    }
    if (arg === "--model") {
      model = requireValue("--model", argv[++i]);
      continue;
    }
    if (arg === "--base-url") {
      baseUrl = requireValue("--base-url", argv[++i]);
      continue;
    }
    if (arg === "--allow-guarded-tools") {
      allowGuardedTools = true;
      continue;
    }
    if (arg === "--mcp") {
      mcp = true;
      continue;
    }
    if (arg === "--dump-prompts") {
      dumpPrompts = true;
      continue;
    }
    if (arg === "--dump-prompts-dir") {
      dumpPromptsDir = requireValue("--dump-prompts-dir", argv[++i]);
      dumpPrompts = true;
      continue;
    }
    if (arg === "--no-session-event-log") {
      sessionEventLog = false;
      continue;
    }
    if (arg === "--session-event-log-dir") {
      sessionEventLogDir = requireValue("--session-event-log-dir", argv[++i]);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag "${arg}".`);
    }
    promptParts.push(arg);
  }

  return {
    provider,
    allowGuardedTools,
    mcp,
    dumpPrompts,
    dumpPromptsDir,
    sessionEventLog,
    sessionEventLogDir,
    model,
    baseUrl,
    prompt: promptParts.join(" ").trim()
  };
}

export function createCliRuntime(
  args: ParsedCliArgs,
  env: NodeJS.ProcessEnv,
  options: CreateCliRuntimeOptions = {}
): CliRuntimeConfig {
  const dumpPrompts =
    args.dumpPrompts || isTruthyEnv(env.HONEY_DUMP_PROMPTS);
  const dumpPromptsDir =
    args.dumpPromptsDir ?? env.HONEY_DUMP_PROMPTS_DIR ?? undefined;
  const sessionEventLog =
    args.sessionEventLog && !isFalsyEnv(env.HONEY_SESSION_EVENT_LOG);
  const sessionEventLogDir =
    args.sessionEventLogDir ?? env.HONEY_SESSION_EVENT_LOG_DIR ?? undefined;

  if (args.provider === "scripted") {
    return {
      provider: new ScriptedProvider(),
      allowGuardedTools: args.allowGuardedTools,
      mcp: args.mcp,
      dumpPrompts,
      dumpPromptsDir,
      sessionEventLog,
      sessionEventLogDir,
      model: args.model,
      baseUrl: args.baseUrl,
      prompt: args.prompt
    };
  }

  const apiKey = env.DEEPSEEK_API_KEY || env.HONEY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DeepSeek provider requires DEEPSEEK_API_KEY or HONEY_API_KEY."
    );
  }

  const model =
    args.model ?? env.HONEY_MODEL ?? DEEPSEEK_DEFAULT_MODEL;
  const baseUrl =
    args.baseUrl ?? env.HONEY_BASE_URL ?? DEEPSEEK_DEFAULT_BASE_URL;

  return {
    provider: new OpenAiCompatibleProvider({
      name: "deepseek",
      apiKey,
      baseUrl,
      model,
      transport: options.transport
    }),
    allowGuardedTools: args.allowGuardedTools,
    mcp: args.mcp,
    dumpPrompts,
    dumpPromptsDir,
    sessionEventLog,
    sessionEventLogDir,
    model,
    baseUrl,
    prompt: args.prompt
  };
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isFalsyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no";
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}
