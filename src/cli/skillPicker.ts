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
 * Non-TTY Skill listing. TTY REPL uses the Session TUI slash overlay instead.
 */
export async function pickSkill(input: {
  skills: SkillManifest[];
  isTTY: boolean;
}): Promise<SkillPickerResult> {
  if (input.skills.length === 0) {
    return { status: "empty" };
  }

  // TTY path is handled by Session TUI; keep a safe fallback list here.
  return pickSkillNonTty(input.skills);
}

function pickSkillNonTty(skills: SkillManifest[]): SkillPickerResult {
  const lines = [
    "Skills (non-interactive terminal — type $name on the next prompt):"
  ];
  skills.forEach((skill, index) => {
    lines.push(`  ${index + 1}. ${formatSkillChoiceLabel(skill)}`);
  });
  process.stderr.write(`${lines.join("\n")}\n`);
  return { status: "cancelled" };
}

/** Prefill the next readline question with `$skillName `. */
export async function questionWithSkillPrefill(
  rl: {
    question: (prompt: string) => Promise<string>;
    write: (text: string) => void;
  },
  prompt: string,
  skillName: string
): Promise<string> {
  const pending = rl.question(prompt);
  rl.write(`$${skillName} `);
  return pending;
}
