import { describe, expect, it } from "vitest";
import {
  formatSubagentResult,
  SUBAGENT_SUMMARY_MAX_CHARS,
  truncateSubagentSummary
} from "./subagent.js";

describe("Subagent result", () => {
  it("formats structured JSON with run_id and status", () => {
    const content = formatSubagentResult({
      summary: "hello",
      status: "completed",
      run_id: "abc"
    });
    expect(JSON.parse(content)).toEqual({
      summary: "hello",
      status: "completed",
      run_id: "abc"
    });
  });

  it("truncates oversized summaries", () => {
    const summary = "x".repeat(SUBAGENT_SUMMARY_MAX_CHARS + 50);
    const truncated = truncateSubagentSummary(summary);
    expect(truncated.length).toBeLessThan(summary.length);
    expect(truncated.endsWith("…[truncated]")).toBe(true);

    const parsed = JSON.parse(
      formatSubagentResult({
        summary,
        status: "error",
        run_id: "r1"
      })
    ) as { summary: string };
    expect(parsed.summary.endsWith("…[truncated]")).toBe(true);
  });
});
