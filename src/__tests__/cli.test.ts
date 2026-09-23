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
    // spawnSync is not a TTY, so the Session banner is omitted by design.
    expect(result.stdout).not.toContain("Honey REPL.");
    expect(result.stdout).not.toContain("Type a prompt, or exit to quit.");
    expect(result.stdout).toContain("Bye.");
  });

  it("prints Context inventory from the REPL context command", () => {
    const result = spawnSync("node", [cliEntry], {
      cwd: process.cwd(),
      input: "context\nexit\n",
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Context inventory");
    expect(result.stdout).toContain("Working set");
    expect(result.stdout).toContain("Root set");
  });

  it("lists Skills for / in non-TTY REPL", () => {
    const result = spawnSync("node", [cliEntry], {
      cwd: process.cwd(),
      // Single line only: multi-question piped stdin is unreliable under spawnSync.
      input: "/\n",
      encoding: "utf8",
      env: {
        ...process.env,
        // Isolate from the developer's ~/.agents/skills while keeping bundled skills.
        HONEY_SKILLS_HOME: resolve(process.cwd(), ".honey-test-empty-home")
      }
    });

    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain("Skills");
    expect(combined).toContain("skill-guide");
    expect(combined).toContain("$name");
  });

  it("does not print the Session banner in command mode", () => {
    const result = spawnSync("node", [cliEntry, "read: CONTEXT.md"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Type a prompt, or exit to quit.");
    expect(result.stdout).not.toContain("__________");
  });

  it("rejects DeepSeek without an API key", () => {
    const result = spawnSync(
      "node",
      [cliEntry, "--provider", "deepseek", "hello"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: "",
          HONEY_API_KEY: ""
        }
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DEEPSEEK_API_KEY");
  });

  it("rejects an unknown provider", () => {
    const result = spawnSync("node", [cliEntry, "--provider", "anthropic"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown provider");
  });
});
