import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cliEntry = resolve(process.cwd(), "dist/cli.js");

describe("CLI seam", () => {
  it("runs one-shot command mode when a prompt argument is passed", () => {
    const result = spawnSync("node", [cliEntry, "read: CONTEXT.md"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tool result received:");
  });

  it("enters REPL mode and exits cleanly", () => {
    const result = spawnSync("node", [cliEntry], {
      cwd: process.cwd(),
      input: "exit\n",
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Honey REPL.");
    expect(result.stdout).toContain("Bye.");
  });
});
