import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDefinition } from "../types.js";
import { authorizeToolCall, toolsForPrompt } from "./policy.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(dir, { recursive: true, force: true })
    );
  }
});

const catalog: ToolDefinition[] = [
  def("read_file", "safe", ["path"]),
  def("search_workspace", "safe"),
  def("update_plan", "safe"),
  def("apply_patch", "guarded", ["path"]),
  def("exec_command", "guarded"),
  def("spawn_subagent", "guarded"),
  def("blocked_tool", "blocked")
];

describe("Policy toolsForPrompt", () => {
  it("offers only Plan Mode allowlist while planMode is on", () => {
    const names = toolsForPrompt(catalog, { planMode: true }).map((t) => t.name);
    expect(names.sort()).toEqual(
      ["read_file", "search_workspace", "update_plan"].sort()
    );
  });

  it("hides update_plan outside Plan Mode and keeps other Tools", () => {
    const names = toolsForPrompt(catalog, { planMode: false }).map((t) => t.name);
    expect(names).toContain("apply_patch");
    expect(names).toContain("read_file");
    expect(names).not.toContain("update_plan");
  });
});

describe("Policy authorizeToolCall", () => {
  it("returns unknown_tool when the Tool is absent", async () => {
    const outcome = await authorizeToolCall({
      toolDefinition: null,
      toolCall: call("missing_tool"),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd: await makeCwd()
    });
    expect(outcome).toEqual({ kind: "unknown_tool" });
  });

  it("returns plan_denied for mutating Tools in Plan Mode", async () => {
    const outcome = await authorizeToolCall({
      toolDefinition: def("apply_patch", "guarded", ["path"]),
      toolCall: call("apply_patch", { path: "a.txt" }),
      planMode: true,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd: await makeCwd()
    });
    expect(outcome).toEqual({
      kind: "plan_denied",
      reason: "not_in_allowlist"
    });
  });

  it("returns plan_denied for update_plan outside Plan Mode", async () => {
    const outcome = await authorizeToolCall({
      toolDefinition: def("update_plan", "safe"),
      toolCall: call("update_plan", { markdown: "# x" }),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd: await makeCwd()
    });
    expect(outcome).toEqual({
      kind: "plan_denied",
      reason: "update_plan_outside_plan_mode"
    });
  });

  it("returns blocked for blocked ToolRisk", async () => {
    const outcome = await authorizeToolCall({
      toolDefinition: def("blocked_tool", "blocked"),
      toolCall: call("blocked_tool"),
      planMode: false,
      allowGuardedTools: true,
      workspaceBoundEnabled: true,
      cwd: await makeCwd()
    });
    expect(outcome).toEqual({ kind: "blocked" });
  });

  it("returns bound_reject before needs_approval for path escape", async () => {
    const cwd = await makeCwd();
    const outcome = await authorizeToolCall({
      toolDefinition: def("apply_patch", "guarded", ["path"]),
      toolCall: call("apply_patch", { path: "../escape.txt" }),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd
    });
    expect(outcome.kind).toBe("bound_reject");
    if (outcome.kind === "bound_reject") {
      expect(outcome.reason.length).toBeGreaterThan(0);
      expect(outcome.attemptedPath.length).toBeGreaterThan(0);
    }
  });

  it("returns needs_approval for guarded Tools when bypass is off", async () => {
    const cwd = await makeCwd();
    await writeFile(join(cwd, "a.txt"), "x", "utf8");
    const outcome = await authorizeToolCall({
      toolDefinition: def("apply_patch", "guarded", ["path"]),
      toolCall: call("apply_patch", { path: "a.txt", find: "x", replace: "y" }),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd
    });
    expect(outcome).toEqual({ kind: "needs_approval" });
  });

  it("returns allow for guarded Tools when bypass is on", async () => {
    const cwd = await makeCwd();
    await writeFile(join(cwd, "a.txt"), "x", "utf8");
    const outcome = await authorizeToolCall({
      toolDefinition: def("apply_patch", "guarded", ["path"]),
      toolCall: call("apply_patch", { path: "a.txt", find: "x", replace: "y" }),
      planMode: false,
      allowGuardedTools: true,
      workspaceBoundEnabled: true,
      cwd
    });
    expect(outcome).toEqual({ kind: "allow" });
  });

  it("returns allow for safe Tools inside the bound", async () => {
    const cwd = await makeCwd();
    await writeFile(join(cwd, "a.txt"), "x", "utf8");
    const outcome = await authorizeToolCall({
      toolDefinition: def("read_file", "safe", ["path"]),
      toolCall: call("read_file", { path: "a.txt" }),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: true,
      cwd
    });
    expect(outcome).toEqual({ kind: "allow" });
  });

  it("skips Workspace bound when the bypass input disables it", async () => {
    const cwd = await makeCwd();
    const outcome = await authorizeToolCall({
      toolDefinition: def("read_file", "safe", ["path"]),
      toolCall: call("read_file", { path: "../outside.txt" }),
      planMode: false,
      allowGuardedTools: false,
      workspaceBoundEnabled: false,
      cwd
    });
    expect(outcome).toEqual({ kind: "allow" });
  });
});

function def(
  name: string,
  risk: ToolDefinition["risk"],
  pathParams?: string[]
): ToolDefinition {
  return {
    name,
    description: name,
    risk,
    inputSchema: {},
    pathParams
  };
}

function call(toolName: string, args: Record<string, unknown> = {}) {
  return { callId: "c1", toolName, arguments: args };
}

async function makeCwd() {
  const dir = await mkdtemp(join(tmpdir(), "honey-policy-"));
  tempDirs.push(dir);
  return dir;
}
