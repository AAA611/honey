import type { SkillManifest } from "./types.js";

/**
 * Render the Skill catalog Root-set section: discovery metadata only, no bodies.
 */
export function formatSkillCatalog(skills: SkillManifest[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "Available Skills (progressive disclosure):",
    "Use read_file on a skill file path to load full SKILL.md instructions when relevant.",
    "User may also force-load with $skill-name in their message.",
    "To run a packaged script, use run_skill_script (package-relative paths only).",
    ""
  ];

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`);
    lines.push(`  file: ${skill.skillFilePath}`);
    lines.push(`  scope: ${skill.scope} (${skill.rootKind})`);
    if (!skill.policy.allowImplicitInvocation) {
      lines.push("  invocation: explicit $name only (implicit disabled)");
    }
    if (skill.scripts.length > 0) {
      lines.push(`  scripts: ${skill.scripts.join(", ")}`);
    }
    if (skill.references.length > 0) {
      lines.push(`  references: ${skill.references.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function formatExplicitSkillInstructions(
  skills: SkillManifest[]
): string {
  if (skills.length === 0) {
    return "";
  }

  return skills
    .map(
      (skill) =>
        `## $${skill.name}\n(file: ${skill.skillFilePath})\n\n${skill.body}`
    )
    .join("\n\n");
}
