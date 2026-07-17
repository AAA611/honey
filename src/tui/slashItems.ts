import type { SkillManifest } from "../skills/types.js";

export type SlashCommandId = "context" | "clear" | "exit";

export type SlashItem =
  | {
      kind: "command";
      id: SlashCommandId;
      label: string;
      description: string;
    }
  | {
      kind: "skill";
      id: string;
      label: string;
      description: string;
      skillName: string;
    };

const BUILTIN_COMMANDS: Array<{
  id: SlashCommandId;
  label: string;
  description: string;
}> = [
  {
    id: "context",
    label: "/context",
    description: "Show Context inventory for the current Session"
  },
  {
    id: "clear",
    label: "/clear",
    description: "Clear Transcript, Plan, and Working set"
  },
  {
    id: "exit",
    label: "/exit",
    description: "Exit the Session"
  }
];

/**
 * Slash mode is active when the Composer value starts with `/` and the
 * first token has not yet been committed with a trailing space after a
 * completed non-slash message. v1: entire value is the slash query when
 * it begins with `/` and contains no space (still typing `/foo`), or is
 * exactly a slash command being filtered.
 */
export function getSlashQuery(value: string): string | null {
  if (!value.startsWith("/")) {
    return null;
  }
  // Once the user has inserted `$skill ` or typed a normal prompt, no leading /.
  // While filtering, allow `/`, `/c`, `/skill-name` without spaces.
  if (value.includes(" ")) {
    return null;
  }
  return value.slice(1).toLowerCase();
}

export function buildSlashItems(skills: SkillManifest[]): SlashItem[] {
  const commands: SlashItem[] = BUILTIN_COMMANDS.map((command) => ({
    kind: "command",
    id: command.id,
    label: command.label,
    description: command.description
  }));

  const skillItems: SlashItem[] = skills.map((skill) => ({
    kind: "skill",
    id: `skill:${skill.name}`,
    label: `/${skill.name}`,
    description: `${skill.description} [${skill.scope}]`,
    skillName: skill.name
  }));

  return [...commands, ...skillItems];
}

export function filterSlashItems(
  items: SlashItem[],
  query: string
): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) => {
    const haystack = `${item.label} ${item.description}`.toLowerCase();
    return haystack.includes(q) || item.id.toLowerCase().includes(q);
  });
}

/** Replace a leading `/query` token with `$skillName `. */
export function insertSkillMention(value: string, skillName: string): string {
  if (!value.startsWith("/")) {
    return `$${skillName} `;
  }
  const rest = value.includes(" ") ? value.slice(value.indexOf(" ") + 1) : "";
  return rest ? `$${skillName} ${rest}` : `$${skillName} `;
}
