import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatSkillCatalog } from "./catalog.js";
import { discoverSkills } from "./discover.js";
import { parseSkillMarkdown } from "./parse.js";
import { SkillRegistry } from "./registry.js";
import {
  evaluateSkillScriptApproval,
  resolveSkillScriptPath,
  runSkillScript
} from "./runScript.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("skills", () => {
  it("parses SKILL.md frontmatter and openai.yaml policy", async () => {
    const root = await makeTemp();
    const skillDir = join(root, "demo");
    await mkdir(join(skillDir, "agents"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: demo
description: Demo skill for parsing
---

# Body here
`,
      "utf8"
    );
    await writeFile(
      join(skillDir, "agents", "openai.yaml"),
      "policy:\n  allow_implicit_invocation: false\n",
      "utf8"
    );
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(join(skillDir, "scripts", "hi.sh"), "#!/bin/sh\necho hi\n", "utf8");

    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(skillDir, "SKILL.md"), "utf8")
    );
    const parsed = parseSkillMarkdown(raw, {
      skillFilePath: join(skillDir, "SKILL.md"),
      rootDir: skillDir,
      scope: "repo",
      rootKind: "honey"
    });

    expect(parsed?.name).toBe("demo");
    expect(parsed?.policy.allowImplicitInvocation).toBe(false);
    expect(parsed?.scripts).toEqual(["scripts/hi.sh"]);
  });

  it("merges discovery with repo > user > bundled and .honey > .agents", async () => {
    const root = await makeTemp();
    const home = join(root, "home");
    const cwd = join(root, "cwd");
    const bundled = join(root, "bundled");

    await writeSkill(join(bundled, "shared"), "shared", "bundled copy");
    await writeSkill(join(home, ".agents", "skills", "shared"), "shared", "user agents");
    await writeSkill(join(home, ".honey", "skills", "shared"), "shared", "user honey");
    await writeSkill(join(cwd, ".agents", "skills", "shared"), "shared", "repo agents");
    await writeSkill(join(cwd, ".honey", "skills", "shared"), "shared", "repo honey wins");
    await writeSkill(join(cwd, ".honey", "skills", "only-repo"), "only-repo", "repo only");

    const skills = discoverSkills({
      cwd,
      homeDir: home,
      bundledSkillsDir: bundled
    });

    const shared = skills.find((skill) => skill.name === "shared");
    expect(shared?.description).toBe("repo honey wins");
    expect(shared?.scope).toBe("repo");
    expect(shared?.rootKind).toBe("honey");
    expect(skills.some((skill) => skill.name === "only-repo")).toBe(true);
  });

  it("formats catalog without bodies and resolves $mentions", () => {
    const registry = new SkillRegistry([
      {
        name: "tdd",
        description: "Test-driven workflow",
        body: "SECRET_BODY",
        skillFilePath: "/tmp/tdd/SKILL.md",
        rootDir: "/tmp/tdd",
        scope: "repo",
        rootKind: "honey",
        policy: { allowImplicitInvocation: true },
        scripts: ["scripts/check.sh"],
        references: []
      }
    ]);

    const catalog = formatSkillCatalog(registry.list());
    expect(catalog).toContain("tdd:");
    expect(catalog).toContain("scripts/check.sh");
    expect(catalog).not.toContain("SECRET_BODY");

    const mention = registry.resolveMentions("$tdd please add tests");
    expect(mention.skills.map((skill) => skill.name)).toEqual(["tdd"]);
    expect(mention.strippedInput).toBe("please add tests");
  });

  it("rejects script path escape and enforces approval by scope", async () => {
    const root = await makeTemp();
    const skillDir = join(root, "pack");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    const scriptPath = join(skillDir, "scripts", "ok.sh");
    await writeFile(scriptPath, "#!/bin/sh\necho ok\n", "utf8");
    await chmod(scriptPath, 0o755);

    const skill = {
      name: "pack",
      description: "pack",
      body: "",
      skillFilePath: join(skillDir, "SKILL.md"),
      rootDir: skillDir,
      scope: "repo" as const,
      rootKind: "honey" as const,
      policy: { allowImplicitInvocation: true },
      scripts: ["scripts/ok.sh"],
      references: []
    };

    expect(resolveSkillScriptPath(skill, "../outside.sh").ok).toBe(false);
    expect(resolveSkillScriptPath(skill, "/etc/passwd").ok).toBe(false);
    const resolved = resolveSkillScriptPath(skill, "scripts/ok.sh");
    expect(resolved.ok).toBe(true);

    expect(
      evaluateSkillScriptApproval({
        scope: "repo",
        allowGuardedTools: false,
        userConfirmed: false
      }).ok
    ).toBe(false);
    expect(
      evaluateSkillScriptApproval({
        scope: "user",
        allowGuardedTools: true,
        userConfirmed: false
      }).ok
    ).toBe(false);
    expect(
      evaluateSkillScriptApproval({
        scope: "user",
        allowGuardedTools: false,
        userConfirmed: true
      }).ok
    ).toBe(true);

    if (resolved.ok) {
      const result = await runSkillScript({
        absolutePath: resolved.absolutePath,
        cwd: root
      });
      expect(result.ok).toBe(true);
      expect(result.content).toContain("ok");
    }
  });
});

async function writeSkill(dir: string, name: string, description: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---
name: ${name}
description: ${description}
---

body
`,
    "utf8"
  );
}

async function makeTemp() {
  const dir = await mkdtemp(join(tmpdir(), "honey-skills-"));
  tempDirs.push(dir);
  return dir;
}
