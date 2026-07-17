import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import type { SkillManifest, SkillScope, SkillScriptRequest } from "./types.js";

export type SkillScriptApproval =
  | { ok: true }
  | { ok: false; reason: string; needsConfirm?: boolean };

export function resolveSkillScriptPath(
  skill: SkillManifest,
  script: string
): { ok: true; absolutePath: string; relativePath: string } | { ok: false; reason: string } {
  const normalized = script.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("..") ||
    normalized.includes("\0")
  ) {
    return { ok: false, reason: "Script path must be a package-relative path without .." };
  }

  if (!normalized.startsWith("scripts/")) {
    return {
      ok: false,
      reason: "Script path must be under scripts/ inside the Skill package"
    };
  }

  const absolutePath = resolve(skill.rootDir, normalized);
  const rootWithSep = skill.rootDir.endsWith(sep)
    ? skill.rootDir
    : `${skill.rootDir}${sep}`;
  if (absolutePath !== skill.rootDir && !absolutePath.startsWith(rootWithSep)) {
    return { ok: false, reason: "Script path escapes the Skill package" };
  }

  return { ok: true, absolutePath, relativePath: normalized };
}

export function evaluateSkillScriptApproval(input: {
  scope: SkillScope;
  allowGuardedTools: boolean;
  userConfirmed: boolean;
}): SkillScriptApproval {
  if (input.scope === "bundled" || input.scope === "repo") {
    if (!input.allowGuardedTools) {
      return {
        ok: false,
        reason: `Guarded Skill script from ${input.scope} requires allowGuardedTools`
      };
    }
    return { ok: true };
  }

  if (input.scope === "user") {
    if (!input.userConfirmed) {
      return {
        ok: false,
        reason: "User-scoped Skill script requires explicit confirmation",
        needsConfirm: true
      };
    }
    return { ok: true };
  }

  return { ok: false, reason: `Unknown Skill scope: ${String(input.scope)}` };
}

export async function runSkillScript(input: {
  absolutePath: string;
  cwd: string;
  args?: string[];
}): Promise<{ ok: boolean; content: string; exitCode: number | null }> {
  try {
    await access(input.absolutePath);
  } catch {
    return {
      ok: false,
      content: `Script not found: ${input.absolutePath}`,
      exitCode: null
    };
  }

  return await new Promise((resolvePromise) => {
    const child = spawn(input.absolutePath, input.args ?? [], {
      cwd: input.cwd,
      shell: false,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolvePromise({
        ok: false,
        content: error.message,
        exitCode: null
      });
    });
    child.on("close", (exitCode) => {
      const content = [
        `exitCode: ${exitCode ?? "null"}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : "stdout: (empty)",
        stderr.trim() ? `stderr:\n${stderr.trim()}` : "stderr: (empty)"
      ].join("\n");
      resolvePromise({
        ok: exitCode === 0,
        content,
        exitCode
      });
    });
  });
}

export function toScriptRequest(
  skill: SkillManifest,
  script: string,
  absolutePath: string
): SkillScriptRequest {
  return {
    skillName: skill.name,
    script,
    scope: skill.scope,
    absolutePath
  };
}
