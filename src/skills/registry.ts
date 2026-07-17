import type { SkillManifest } from "./types.js";
import { discoverSkills } from "./discover.js";
import type { DiscoverSkillsOptions } from "./types.js";
import { formatSkillCatalog } from "./catalog.js";

const SKILL_MENTION_RE = /(?:^|\s)\$([a-z0-9]+(?:-[a-z0-9]+)*)/gi;

export class SkillRegistry {
  private readonly byName = new Map<string, SkillManifest>();

  constructor(skills: SkillManifest[] = []) {
    this.replace(skills);
  }

  static discover(options: DiscoverSkillsOptions): SkillRegistry {
    return new SkillRegistry(discoverSkills(options));
  }

  replace(skills: SkillManifest[]): void {
    this.byName.clear();
    for (const skill of skills) {
      this.byName.set(skill.name, skill);
    }
  }

  list(): SkillManifest[] {
    return [...this.byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  get(name: string): SkillManifest | undefined {
    return this.byName.get(name);
  }

  catalogText(): string {
    return formatSkillCatalog(this.list());
  }

  resolveMentions(userInput: string): {
    strippedInput: string;
    skills: SkillManifest[];
    unknown: string[];
  } {
    const found = new Map<string, SkillManifest>();
    const unknown: string[] = [];

    for (const match of userInput.matchAll(SKILL_MENTION_RE)) {
      const name = match[1] ?? "";
      const skill = this.byName.get(name);
      if (skill) {
        found.set(skill.name, skill);
      } else if (name) {
        unknown.push(name);
      }
    }

    const strippedInput = userInput
      .replace(SKILL_MENTION_RE, (full) => (full.startsWith(" ") ? " " : ""))
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return {
      strippedInput: strippedInput.length > 0 ? strippedInput : userInput.trim(),
      skills: [...found.values()],
      unknown
    };
  }
}
