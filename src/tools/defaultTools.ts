import { applyPatchTool } from "./applyPatchTool.js";
import { execCommandTool } from "./execCommandTool.js";
import { readFileTool } from "./readFileTool.js";
import { runTestsTool } from "./runTestsTool.js";
import { runSkillScriptTool } from "./runSkillScriptTool.js";
import { searchWorkspaceTool } from "./searchWorkspaceTool.js";
import type { Tool } from "../types.js";

export function createDefaultTools(): Tool[] {
  return [
    readFileTool,
    searchWorkspaceTool,
    execCommandTool,
    applyPatchTool,
    runTestsTool,
    runSkillScriptTool
  ];
}
