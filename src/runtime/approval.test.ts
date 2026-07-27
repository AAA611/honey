import { describe, expect, it } from "vitest";
import {
  createApprovalRequest,
  formatApprovalArgumentSummary,
  formatApprovalPrompt
} from "./approval.js";

describe("Approval formatting", () => {
  it("summarizes Name+args and truncates long values", () => {
    expect(
      formatApprovalArgumentSummary({
        path: "editable.txt",
        find: "before",
        replace: "after"
      })
    ).toBe("path=editable.txt find=before replace=after");

    const long = "x".repeat(200);
    const summary = formatApprovalArgumentSummary({ command: long });
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("builds an Approval prompt from a ToolCall", () => {
    const request = createApprovalRequest({
      callId: "c1",
      toolName: "exec_command",
      arguments: { command: "npm test" }
    });
    expect(formatApprovalPrompt(request)).toBe(
      "Allow guarded tool exec_command? command=npm test [y/N]"
    );
  });
});
