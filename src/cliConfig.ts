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
  model?: string;
  baseUrl?: string;
  prompt: string;
}

export interface CliRuntimeConfig {
  provider: Provider;
  allowGuardedTools: boolean;
  model?: string;
  baseUrl?: string;
  prompt: string;
}

export interface CreateCliRuntimeOptions {
  transport?: HttpTransport;
}

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  let provider: CliProviderName = "scripted";
  let allowGuardedTools = false;
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
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag "${arg}".`);
    }
    promptParts.push(arg);
  }

  return {
    provider,
    allowGuardedTools,
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
  if (args.provider === "scripted") {
    return {
      provider: new ScriptedProvider(),
      allowGuardedTools: args.allowGuardedTools,
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
    model,
    baseUrl,
    prompt: args.prompt
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}
