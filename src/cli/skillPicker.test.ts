import { describe, expect, it, vi } from "vitest";
import {
  formatSkillChoiceLabel,
  isSkillPickerCommand,
  pickSkill
} from "./skillPicker.js";
import type { SkillManifest } from "../skills/types.js";

const sampleSkill: SkillManifest = {
  name: "skill-guide",
  description: "Explain how honey Skills work",
  body: "",
  skillFilePath: "/tmp/SKILL.md",
  rootDir: "/tmp",
  scope: "bundled",
  rootKind: "honey",
  policy: { allowImplicitInvocation: true },
  scripts: [],
  references: []
};

describe("skillPicker", () => {
  it("recognizes / and /skills only", () => {
    expect(isSkillPickerCommand("/")).toBe(true);
    expect(isSkillPickerCommand("/skills")).toBe(true);
    expect(isSkillPickerCommand(" /skills ")).toBe(true);
    expect(isSkillPickerCommand("/skills list")).toBe(false);
    expect(isSkillPickerCommand("$skill-guide")).toBe(false);
    expect(isSkillPickerCommand("skills")).toBe(false);
  });

  it("formats choice labels with name, description, and scope", () => {
    expect(formatSkillChoiceLabel(sampleSkill)).toBe(
      "skill-guide — Explain how honey Skills work [bundled]"
    );
  });

  it("lists skills on stderr for non-TTY and returns cancelled", async () => {
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);

    const result = await pickSkill({ skills: [sampleSkill], isTTY: false });

    spy.mockRestore();
    expect(result).toEqual({ status: "cancelled" });
    expect(chunks.join("")).toContain("skill-guide");
    expect(chunks.join("")).toContain("$name");
  });

  it("returns empty when no skills are available", async () => {
    await expect(pickSkill({ skills: [], isTTY: false })).resolves.toEqual({
      status: "empty"
    });
  });
});
