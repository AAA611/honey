/**
 * Plugin is a future installable distribution unit.
 * v1 keeps only the type surface — no install, enable/disable, or MCP bundling.
 */
export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  /** Relative paths to Skill directories packaged inside the Plugin. */
  skills?: string[];
}
