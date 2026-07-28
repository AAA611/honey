import { describe, expect, it } from "vitest";
import { execCommandTool } from "./execCommandTool.js";

const cwd = process.cwd();

describe("execCommandTool Soft failure", () => {
  it("returns Soft failure when a command exits non-zero", async () => {
    const started = await execCommandTool.execute(
      { action: "start", command: "exit 42" },
      { cwd }
    );
    expect(started.ok).toBe(true);
    const sessionId = JSON.parse(started.content).id as string;

    const snapped = await waitForExited(sessionId);
    expect(snapped.ok).toBe(false);
    expect(snapped.content).toMatch(/^Soft failure:/);
    expect(snapped.content).toContain("42");
    expect(snapped.content).toMatch(/Next:/);
    expect(snapped.metadata?.exitCode).toBe(42);
  });

  it("returns Soft failure for unsupported actions", async () => {
    const result = await execCommandTool.execute(
      { action: "nope" },
      { cwd }
    );
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/^Soft failure:/);
    expect(result.content).toContain("Unsupported action");
    expect(result.content).toMatch(/Next:/);
  });
});

async function waitForExited(sessionId: string) {
  for (let i = 0; i < 40; i += 1) {
    const snapped = await execCommandTool.execute(
      { action: "snapshot", sessionId },
      { cwd }
    );
    if (snapped.metadata?.status === "exited") {
      return snapped;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("session did not exit in time");
}
