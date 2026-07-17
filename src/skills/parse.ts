import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillManifest, SkillPolicy } from "./types.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseSkillMarkdown(
  raw: string,
  location: {
    skillFilePath: string;
    rootDir: string;
    scope: SkillManifest["scope"];
    rootKind: SkillManifest["rootKind"];
  }
): SkillManifest | null {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return null;
  }

  const frontmatter = parseSimpleYamlMap(match[1] ?? "");
  const name = String(frontmatter.name ?? "").trim();
  const description = String(frontmatter.description ?? "").trim();
  if (!name || !description) {
    return null;
  }

  const policy = loadSkillPolicy(location.rootDir);
  const scripts = listRelativeFiles(join(location.rootDir, "scripts"));
  const references = listRelativeFiles(join(location.rootDir, "references"));

  return {
    name,
    description,
    body: (match[2] ?? "").trim(),
    skillFilePath: location.skillFilePath,
    rootDir: location.rootDir,
    scope: location.scope,
    rootKind: location.rootKind,
    policy,
    scripts: scripts.map((path) => `scripts/${path}`),
    references: references.map((path) => `references/${path}`)
  };
}

export function loadSkillPolicy(rootDir: string): SkillPolicy {
  const candidates = [
    join(rootDir, "agents", "openai.yaml"),
    join(rootDir, "agents", "openai.yml")
  ];

  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      const allow = readAllowImplicitInvocation(raw);
      if (allow !== undefined) {
        return { allowImplicitInvocation: allow };
      }
    } catch {
      // optional sidecar
    }
  }

  return { allowImplicitInvocation: true };
}

/** Minimal YAML map parser for SKILL.md frontmatter (flat string keys). */
export function parseSimpleYamlMap(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readAllowImplicitInvocation(raw: string): boolean | undefined {
  const match = raw.match(/allow_implicit_invocation\s*:\s*(true|false)/i);
  if (!match) {
    return undefined;
  }
  return match[1]?.toLowerCase() === "true";
}

function listRelativeFiles(dir: string): string[] {
  try {
    if (!statSync(dir).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const out: string[] = [];
  walk(dir, "", out);
  return out.sort();
}

function walk(absDir: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}
