import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillMarkdown } from "./parse.js";
import type {
  DiscoverSkillsOptions,
  SkillManifest,
  SkillRootKind,
  SkillScope
} from "./types.js";

export function defaultBundledSkillsDir(): string {
  return fileURLToPath(new URL("./bundled", import.meta.url));
}

/**
 * Discover Skills from bundled, user, and repo roots.
 * Later entries overwrite earlier ones for the same name:
 * bundled → user/.agents → user/.honey → repo/.agents → repo/.honey
 * which yields precedence repo > user > bundled and .honey > .agents.
 */
export function discoverSkills(
  options: DiscoverSkillsOptions
): SkillManifest[] {
  const home = options.homeDir ?? homedir();
  const bundledDir = options.bundledSkillsDir ?? defaultBundledSkillsDir();
  const byName = new Map<string, SkillManifest>();

  const layers: Array<{
    dir: string;
    scope: SkillScope;
    rootKind: SkillRootKind;
  }> = [
    { dir: bundledDir, scope: "bundled", rootKind: "honey" },
    { dir: join(home, ".agents", "skills"), scope: "user", rootKind: "agents" },
    { dir: join(home, ".honey", "skills"), scope: "user", rootKind: "honey" },
    {
      dir: join(options.cwd, ".agents", "skills"),
      scope: "repo",
      rootKind: "agents"
    },
    {
      dir: join(options.cwd, ".honey", "skills"),
      scope: "repo",
      rootKind: "honey"
    }
  ];

  for (const layer of layers) {
    for (const skill of loadSkillsFromRoot(layer.dir, layer.scope, layer.rootKind)) {
      byName.set(skill.name, skill);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadSkillsFromRoot(
  root: string,
  scope: SkillScope,
  rootKind: SkillRootKind
): SkillManifest[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const rootDir = join(root, entry.name);
    const skillFilePath = join(rootDir, "SKILL.md");
    try {
      if (!statSync(skillFilePath).isFile()) {
        continue;
      }
      const raw = readFileSync(skillFilePath, "utf8");
      const parsed = parseSkillMarkdown(raw, {
        skillFilePath,
        rootDir,
        scope,
        rootKind
      });
      if (parsed) {
        skills.push(parsed);
      }
    } catch {
      // skip unreadable / invalid skills
    }
  }
  return skills;
}
