/**
 * Feedback loop: committed Reasoning must appear above its assistant answer,
 * and be collapsible in the Session TUI.
 *
 * Command:
 *   npx vitest run src/tui/reasoning.order.test.tsx
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { TranscriptView } from "./TranscriptView.js";

describe("TranscriptView Reasoning order and collapse", () => {
  it("renders committed reasoning above the paired assistant answer", () => {
    const { lastFrame } = render(
      <TranscriptView
        messages={[
          { role: "user", content: "what is 2+2?" },
          { role: "assistant", content: "4" }
        ]}
        notices={[]}
        reasoning={["add the integers"]}
        reasoningExpanded={{ 0: true }}
      />
    );
    const frame = lastFrame() ?? "";
    const reasoningAt = frame.indexOf("add the integers");
    const answerAt = frame.indexOf("4");
    expect(reasoningAt, "reasoning text visible").toBeGreaterThanOrEqual(0);
    expect(answerAt, "answer visible").toBeGreaterThanOrEqual(0);
    expect(
      reasoningAt,
      "reasoning must appear before the final answer"
    ).toBeLessThan(answerAt);
  });

  it("collapses reasoning by default and expands when marked open", () => {
    const secret = "long private deliberation that should stay hidden";
    const collapsed = render(
      <TranscriptView
        messages={[{ role: "assistant", content: "done" }]}
        notices={[]}
        reasoning={[secret]}
        reasoningExpanded={{}}
      />
    );
    const collapsedFrame = collapsed.lastFrame() ?? "";
    expect(collapsedFrame).toMatch(/▸ reasoning/);
    expect(collapsedFrame).toMatch(/r expand/);
    expect(collapsedFrame).not.toContain(secret);

    collapsed.unmount();

    const expanded = render(
      <TranscriptView
        messages={[{ role: "assistant", content: "done" }]}
        notices={[]}
        reasoning={[secret]}
        reasoningExpanded={{ 0: true }}
      />
    );
    const expandedFrame = expanded.lastFrame() ?? "";
    expect(expandedFrame).toMatch(/▾ reasoning/);
    expect(expandedFrame).toContain(secret);
    expanded.unmount();
  });
});
