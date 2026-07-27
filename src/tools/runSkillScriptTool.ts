import {
  resolveSkillScriptPath,
  runSkillScript
} from "../skills/runScript.js";
import type { Tool, ToolExecutionContext } from "../types.js";

export const runSkillScriptTool: Tool = {
  definition: {
    name: "run_skill_script",
    description:
      "Run a script packaged inside a discovered Skill. Path must be package-relative under scripts/.",
    risk: "guarded",
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill name from the catalog" },
        script: {
          type: "string",
          description: "Package-relative script path, e.g. scripts/setup.sh"
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Optional argv passed to the script"
        }
      },
      required: ["skill", "script"]
    }
  },
  async execute(input, context: ToolExecutionContext) {
    const skillName = String(input.skill ?? "").trim();
    const script = String(input.script ?? "").trim();
    const args = Array.isArray(input.args)
      ? input.args.map((value) => String(value))
      : [];

    const registry = context.skillRegistry;
    if (!registry) {
      return { ok: false, content: "Skill registry is unavailable" };
    }

    const skill = registry.get(skillName);
    if (!skill) {
      return { ok: false, content: `Unknown Skill: ${skillName}` };
    }

    const resolved = resolveSkillScriptPath(skill, script);
    if (!resolved.ok) {
      return { ok: false, content: resolved.reason };
    }

    // Guarded execution / Approval is owned by Harness.executeTool (ADR-0009).
    const result = await runSkillScript({
      absolutePath: resolved.absolutePath,
      cwd: context.cwd,
      args
    });
    return {
      ok: result.ok,
      content: result.content,
      metadata: {
        skill: skill.name,
        script: resolved.relativePath,
        scope: skill.scope,
        exitCode: result.exitCode
      }
    };
  }
};
