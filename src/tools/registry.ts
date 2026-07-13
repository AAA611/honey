import type { Tool } from "../types.js";

export class ToolRegistry {
  private readonly byName = new Map<string, Tool>();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.byName.set(tool.definition.name, tool);
    }
  }

  definitions() {
    return [...this.byName.values()].map((tool) => tool.definition);
  }

  get(name: string): Tool | undefined {
    return this.byName.get(name);
  }
}
