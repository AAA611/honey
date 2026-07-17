import { describe, expect, it } from "vitest";
import {
  buildSlashItems,
  filterSlashItems,
  getSlashQuery,
  insertSkillMention
} from "./slashItems.js";
import type { SkillManifest } from "../skills/types.js";

const sample: SkillManifest = {
  name: "skill-guide",
  description: "Explain skills",
  body: "",
  skillFilePath: "/tmp/SKILL.md",
  rootDir: "/tmp",
  scope: "bundled",
  rootKind: "honey",
  policy: { allowImplicitInvocation: true },
  scripts: [],
  references: []
};

describe("slashItems", () => {
  it("detects slash query only for leading / without spaces", () => {
    expect(getSlashQuery("/")).toBe("");
    expect(getSlashQuery("/con")).toBe("con");
    expect(getSlashQuery("/skill-guide")).toBe("skill-guide");
    expect(getSlashQuery("$skill-guide do it")).toBeNull();
    expect(getSlashQuery("/foo bar")).toBeNull();
    expect(getSlashQuery("hello")).toBeNull();
  });

  it("filters commands and skills together", () => {
    const items = buildSlashItems([sample]);
    expect(filterSlashItems(items, "context").map((item) => item.id)).toEqual([
      "context"
    ]);
    expect(
      filterSlashItems(items, "guide").some(
        (item) => item.kind === "skill" && item.skillName === "skill-guide"
      )
    ).toBe(true);
  });

  it("inserts $skill mention over a slash query", () => {
    expect(insertSkillMention("/guide", "skill-guide")).toBe("$skill-guide ");
    expect(insertSkillMention("/x", "tdd")).toBe("$tdd ");
  });
});
