export type SkillScope = "repo" | "user" | "bundled";

export type SkillRootKind = "agents" | "honey";

export interface SkillPolicy {
  allowImplicitInvocation: boolean;
}

export interface SkillManifest {
  name: string;
  description: string;
  body: string;
  /** Absolute path to SKILL.md */
  skillFilePath: string;
  /** Absolute directory containing SKILL.md */
  rootDir: string;
  scope: SkillScope;
  rootKind: SkillRootKind;
  policy: SkillPolicy;
  scripts: string[];
  references: string[];
}

export interface SkillScriptRequest {
  skillName: string;
  script: string;
  scope: SkillScope;
  absolutePath: string;
}

export interface DiscoverSkillsOptions {
  cwd: string;
  homeDir?: string;
  bundledSkillsDir?: string;
}
