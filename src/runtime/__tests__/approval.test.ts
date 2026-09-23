import { describe, expect, it } from "vitest";
import {
  createApprovalRequest,
  formatApprovalArgumentSummary,
  formatApprovalPrompt,
  formatApprovalView
} from "../../runtime/approval.js";

describe("Approval formatting", () => {
  it("keeps apply_path path visible when find/replace are long", () => {
    const summary = formatApprovalArgumentSummary("apply_patch", {
      path: "src/tui/App.tsx",
      find: "a".repeat(200),
      replace: "b".repeat(200)
    });
    expect(summary.startsWith("path=src/tui/App.tsx")).toBe(true);
    expect(summary).toContain("find=");
    expect(summary).toContain("replace=");
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("omits empty exec_command fields for action=start", () => {
    expect(
      formatApprovalArgumentSummary("exec_command", {
        action: "start",
        command: "npm test",
        sessionId: "",
        input: ""
      })
    ).toBe("action=start command=npm test");
  });

  it("summarizes write action with input and omits sessionId", () => {
    expect(
      formatApprovalArgumentSummary("exec_command", {
        action: "write",
        sessionId: "s1",
        input: "yes\n",
        command: ""
      })
    ).toBe("action=write input=yes");
  });

  it("omits sessionId for snapshot and terminate", () => {
    expect(
      formatApprovalArgumentSummary("exec_command", {
        action: "terminate",
        sessionId: "s1"
      })
    ).toBe("action=terminate");
  });

  it("builds a cleaner one-line Approval prompt", () => {
    const request = createApprovalRequest({
      callId: "c1",
      toolName: "exec_command",
      arguments: { action: "start", command: "npm test" }
    });
    expect(formatApprovalPrompt(request)).toBe(
      "Allow exec_command? action=start command=npm test [y/N]"
    );
  });

  it("builds a structured TUI Approval view for apply_patch", () => {
    const view = formatApprovalView(
      createApprovalRequest({
        callId: "c1",
        toolName: "apply_patch",
        arguments: {
          path: "editable.txt",
          find: "before",
          replace: "after"
        }
      })
    );
    expect(view.headline).toBe("Allow apply_patch?");
    expect(view.hint).toContain("y allow");
    expect(view.details.some((line) => line.includes("path") && line.includes("editable.txt"))).toBe(
      true
    );
    expect(view.details.some((line) => line.includes("− find") && line.includes("before"))).toBe(
      true
    );
    expect(view.details.some((line) => line.includes("+ replace") && line.includes("after"))).toBe(
      true
    );
  });

  it("clips multiline spawn_subagent prompt in the TUI view", () => {
    const prompt = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const view = formatApprovalView(
      createApprovalRequest({
        callId: "c1",
        toolName: "spawn_subagent",
        arguments: { prompt }
      })
    );
    const joined = view.details.join("\n");
    expect(joined).toContain("prompt");
    expect(joined).toContain("line 0");
    expect(joined.split("\n").length).toBeLessThan(20);
  });
});
