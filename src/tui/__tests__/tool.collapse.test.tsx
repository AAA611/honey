/**
 * Tool results collapse by default to the tool name only.
 *
 * Command:
 *   npx vitest run src/tui/tool.collapse.test.tsx
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { TranscriptView } from "../../tui/TranscriptView.js";

describe("TranscriptView tool result collapse", () => {
  it("shows only the tool name when collapsed", () => {
    const body = "file contents that must stay hidden while collapsed";
    const { lastFrame, unmount } = render(
      <TranscriptView
        messages={[
          {
            role: "tool",
            callId: "c1",
            toolName: "read_file",
            content: body,
            ok: true
          }
        ]}
        notices={[]}
        toolExpanded={{}}
      />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/▸ read_file/);
    expect(frame).toMatch(/t expand/);
    expect(frame).not.toContain(body);
    unmount();
  });

  it("reveals tool content when expanded", () => {
    const body = "file contents that must stay hidden while collapsed";
    const { lastFrame, unmount } = render(
      <TranscriptView
        messages={[
          {
            role: "tool",
            callId: "c1",
            toolName: "read_file",
            content: body,
            ok: true
          }
        ]}
        notices={[]}
        toolExpanded={{ 0: true }}
      />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/▾ read_file/);
    expect(frame).toContain(body);
    unmount();
  });
});
