import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectInstructions } from "./projectInstructions.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(dir, { recursive: true, force: true })
    );
  }
});

describe("loadProjectInstructions", () => {
  it("loads project AGENTS.md only (not CONTEXT.md)", async () => {
    const cwd = await fixture();
    await writeFile(join(cwd, "AGENTS.md"), "from-agents", "utf8");
    await writeFile(join(cwd, "CONTEXT.md"), "from-context", "utf8");
    const home = await fixture();

    const loaded = loadProjectInstructions({ cwd, homeDir: home });

    expect(loaded.text).toContain("from-agents");
    expect(loaded.text).not.toContain("from-context");
    expect(loaded.sources.project?.path).toBe(join(cwd, "AGENTS.md"));
    expect(loaded.sources.user).toBeNull();
    expect(loaded.truncated).toBe(false);
  });

  it("prefers ~/.honey/AGENTS.md over ~/.agents/AGENTS.md", async () => {
    const cwd = await fixture();
    const home = await fixture();
    await mkdir(join(home, ".honey"), { recursive: true });
    await mkdir(join(home, ".agents"), { recursive: true });
    await writeFile(join(home, ".honey", "AGENTS.md"), "honey-user", "utf8");
    await writeFile(join(home, ".agents", "AGENTS.md"), "agents-user", "utf8");

    const loaded = loadProjectInstructions({ cwd, homeDir: home });

    expect(loaded.sources.user?.path).toBe(join(home, ".honey", "AGENTS.md"));
    expect(loaded.text).toContain("honey-user");
    expect(loaded.text).not.toContain("agents-user");
  });

  it("falls back to ~/.agents/AGENTS.md when honey is missing", async () => {
    const cwd = await fixture();
    const home = await fixture();
    await mkdir(join(home, ".agents"), { recursive: true });
    await writeFile(join(home, ".agents", "AGENTS.md"), "agents-user", "utf8");

    const loaded = loadProjectInstructions({ cwd, homeDir: home });

    expect(loaded.sources.user?.path).toBe(join(home, ".agents", "AGENTS.md"));
    expect(loaded.text).toContain("agents-user");
  });

  it("concatenates user then project", async () => {
    const cwd = await fixture();
    const home = await fixture();
    await mkdir(join(home, ".honey"), { recursive: true });
    await writeFile(join(home, ".honey", "AGENTS.md"), "USER_BODY", "utf8");
    await writeFile(join(cwd, "AGENTS.md"), "PROJECT_BODY", "utf8");

    const loaded = loadProjectInstructions({ cwd, homeDir: home });

    const userAt = loaded.text.indexOf("USER_BODY");
    const projectAt = loaded.text.indexOf("PROJECT_BODY");
    expect(userAt).toBeGreaterThanOrEqual(0);
    expect(projectAt).toBeGreaterThan(userAt);
    expect(loaded.text).toContain("Instruction source: user");
    expect(loaded.text).toContain("Instruction source: project");
  });

  it("preserves project layer when merged budget is exceeded", async () => {
    const cwd = await fixture();
    const home = await fixture();
    await mkdir(join(home, ".honey"), { recursive: true });
    await writeFile(join(home, ".honey", "AGENTS.md"), "U".repeat(400), "utf8");
    await writeFile(join(cwd, "AGENTS.md"), "PROJECT_KEEP", "utf8");

    const loaded = loadProjectInstructions({
      cwd,
      homeDir: home,
      maxChars: 280
    });

    expect(loaded.truncated).toBe(true);
    expect(loaded.text).toContain("PROJECT_KEEP");
    expect(loaded.text.includes("U".repeat(400))).toBe(false);
  });
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "honey-pi-"));
  tempDirs.push(dir);
  return dir;
}
