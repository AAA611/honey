import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWithinCwd, checkToolCallWorkspaceBound } from "../../runtime/workspaceBound.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      import("node:fs/promises").then(({ rm }) =>
        rm(dir, { recursive: true, force: true })
      )
    )
  );
});

describe("resolveWithinCwd", () => {
  it("accepts a relative path inside cwd", async () => {
    const cwd = await makeDir();
    await writeFile(join(cwd, "inside.txt"), "ok", "utf8");

    const result = await resolveWithinCwd(cwd, "inside.txt");
    expect(result).toEqual({
      ok: true,
      absolutePath: await realpath(join(cwd, "inside.txt"))
    });
  });

  it("rejects path escape via ..", async () => {
    const root = await makeDir();
    const cwd = join(root, "workspace");
    await mkdir(cwd);
    await writeFile(join(root, "secret.txt"), "nope", "utf8");

    const result = await resolveWithinCwd(cwd, "../secret.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/outside workspace|Workspace bound/i);
    }
  });

  it("rejects absolute paths outside cwd", async () => {
    const cwd = await makeDir();
    const outside = join(tmpdir(), "honey-bound-outside.txt");
    await writeFile(outside, "nope", "utf8");
    tempDirs.push(outside);

    const result = await resolveWithinCwd(cwd, outside);
    expect(result.ok).toBe(false);
  });

  it("rejects symlink that points outside cwd", async () => {
    const root = await makeDir();
    const cwd = join(root, "workspace");
    const outsideDir = join(root, "outside");
    await mkdir(cwd);
    await mkdir(outsideDir);
    await writeFile(join(outsideDir, "secret.txt"), "nope", "utf8");
    await symlink(outsideDir, join(cwd, "link"));

    const result = await resolveWithinCwd(cwd, "link/secret.txt");
    expect(result.ok).toBe(false);
  });

  it("allows a non-existent path whose parent stays inside cwd", async () => {
    const cwd = await makeDir();
    await mkdir(join(cwd, "src"));

    const result = await resolveWithinCwd(cwd, "src/new-file.ts");
    const srcReal = await realpath(join(cwd, "src"));
    expect(result).toEqual({
      ok: true,
      absolutePath: join(srcReal, "new-file.ts")
    });
  });

  it("coerces non-string pathParams the same way Tools do", async () => {
    const root = await makeDir();
    const cwd = join(root, "workspace");
    await mkdir(cwd);
    await writeFile(join(root, "secret.txt"), "nope", "utf8");

    const result = await checkToolCallWorkspaceBound({
      cwd,
      pathParams: ["path"],
      arguments: { path: ["../secret.txt"] }
    });
    expect(result.ok).toBe(false);
  });
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "honey-bound-"));
  tempDirs.push(dir);
  return dir;
}
