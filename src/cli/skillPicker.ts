import { select } from "@inquirer/prompts";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import type { SkillManifest } from "../skills/types.js";

export type SkillPickerResult =
  | { status: "selected"; skillName: string }
  | { status: "cancelled" }
  | { status: "empty" };

export function isSkillPickerCommand(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "/" || trimmed === "/skills";
}

export function formatSkillChoiceLabel(skill: SkillManifest): string {
  const desc =
    skill.description.length > 72
      ? `${skill.description.slice(0, 69)}...`
      : skill.description;
  return `${skill.name} — ${desc} [${skill.scope}]`;
}

/**
 * Interactive Skill picker for REPL. TTY uses arrow-key select;
 * non-TTY prints the catalog and asks the user to type `$name` next
 * (avoids a second readline question on piped stdin).
 */
export async function pickSkill(input: {
  skills: SkillManifest[];
  isTTY: boolean;
}): Promise<SkillPickerResult> {
  if (input.skills.length === 0) {
    return { status: "empty" };
  }

  if (input.isTTY) {
    return pickSkillInteractive(input.skills);
  }

  return pickSkillNonTty(input.skills);
}

async function pickSkillInteractive(
  skills: SkillManifest[]
): Promise<SkillPickerResult> {
  try {
    const skillName = await select({
      message: "Select a Skill",
      choices: skills.map((skill) => ({
        name: formatSkillChoiceLabel(skill),
        value: skill.name,
        description: skill.skillFilePath
      }))
    });
    return { status: "selected", skillName };
  } catch {
    // Ctrl+C / Esc via ExitPromptError
    return { status: "cancelled" };
  }
}

function pickSkillNonTty(skills: SkillManifest[]): SkillPickerResult {
  const lines = [
    "Skills (non-interactive terminal — type $name on the next prompt):"
  ];
  skills.forEach((skill, index) => {
    lines.push(`  ${index + 1}. ${formatSkillChoiceLabel(skill)}`);
  });
  // Prefer stderr so piped/spawnSync stdin+stdout flows keep working after a large list.
  process.stderr.write(`${lines.join("\n")}\n`);
  return { status: "cancelled" };
}

/** Prefill the next readline question with `$skillName `. */
export async function questionWithSkillPrefill(
  rl: ReadlineInterface,
  prompt: string,
  skillName: string
): Promise<string> {
  const pending = rl.question(prompt);
  rl.write(`$${skillName} `);
  return pending;
}
