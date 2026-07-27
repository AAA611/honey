import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type InstructionSourceKind = "user" | "project";

export interface InstructionSource {
  kind: InstructionSourceKind;
  path: string;
}

export interface ProjectInstructionsSources {
  user: InstructionSource | null;
  project: InstructionSource | null;
}

export interface ProjectInstructionsLoadResult {
  text: string;
  sources: ProjectInstructionsSources;
  truncated: boolean;
}

export interface LoadProjectInstructionsOptions {
  cwd: string;
  /** Override home directory (tests). Defaults to os.homedir(). */
  homeDir?: string;
  /** Merged char budget. Defaults to 6000. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 6_000;

/**
 * Load Project instructions per ADR-0011:
 * user (winner-take-all ~/.honey then ~/.agents) then project (<cwd>),
 * merged budget preserving project on truncate.
 */
export function loadProjectInstructions(
  options: LoadProjectInstructionsOptions
): ProjectInstructionsLoadResult {
  const home = options.homeDir ?? homedir();
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  const userPath = resolveUserAgentsPath(home);
  const projectPath = join(options.cwd, "AGENTS.md");

  const userRaw = userPath ? readOptionalFile(userPath) : null;
  const projectRaw = readOptionalFile(projectPath);

  const sources: ProjectInstructionsSources = {
    user: userPath && userRaw !== null ? { kind: "user", path: userPath } : null,
    project: projectRaw !== null ? { kind: "project", path: projectPath } : null
  };

  const userSection =
    sources.user && userRaw !== null
      ? formatSection(sources.user, userRaw)
      : null;
  const projectSection =
    sources.project && projectRaw !== null
      ? formatSection(sources.project, projectRaw)
      : null;

  return mergeSections(userSection, projectSection, maxChars, sources);
}

function resolveUserAgentsPath(home: string): string | null {
  const honey = join(home, ".honey", "AGENTS.md");
  if (readOptionalFile(honey) !== null) {
    return honey;
  }
  const agents = join(home, ".agents", "AGENTS.md");
  if (readOptionalFile(agents) !== null) {
    return agents;
  }
  return null;
}

function readOptionalFile(path: string): string | null {
  try {
    const raw = readFileSync(path, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function formatSection(source: InstructionSource, body: string): string {
  return `# Instruction source: ${source.kind} (${source.path})\n${body}`;
}

function mergeSections(
  userSection: string | null,
  projectSection: string | null,
  maxChars: number,
  sources: ProjectInstructionsSources
): ProjectInstructionsLoadResult {
  if (!userSection && !projectSection) {
    return { text: "", sources, truncated: false };
  }

  if (!userSection && projectSection) {
    return fitSingle(projectSection, maxChars, sources);
  }

  if (userSection && !projectSection) {
    return fitSingle(userSection, maxChars, sources);
  }

  // Both present: preserve project; spill/cut user first.
  const project = projectSection!;
  const user = userSection!;
  const joiner = "\n\n";

  if (project.length >= maxChars) {
    return {
      text: truncateSection(project, maxChars),
      sources,
      truncated: true
    };
  }

  const roomForUser = maxChars - project.length - joiner.length;
  if (roomForUser <= 0) {
    return {
      text: project,
      sources,
      truncated: true
    };
  }

  if (user.length <= roomForUser) {
    const text = `${user}${joiner}${project}`;
    return {
      text,
      sources,
      truncated: false
    };
  }

  const truncatedUser = truncateSection(user, roomForUser);
  return {
    text: `${truncatedUser}${joiner}${project}`,
    sources,
    truncated: true
  };
}

function fitSingle(
  section: string,
  maxChars: number,
  sources: ProjectInstructionsSources
): ProjectInstructionsLoadResult {
  if (section.length <= maxChars) {
    return { text: section, sources, truncated: false };
  }
  return {
    text: truncateSection(section, maxChars),
    sources,
    truncated: true
  };
}

/** Prefer keeping the Instruction source header; truncate the body. */
function truncateSection(section: string, maxChars: number): string {
  if (section.length <= maxChars) {
    return section;
  }
  const nl = section.indexOf("\n");
  if (nl === -1) {
    return truncateWithEllipsis(section, maxChars);
  }
  const header = section.slice(0, nl);
  const body = section.slice(nl + 1);
  if (header.length + 1 >= maxChars) {
    return truncateWithEllipsis(section, maxChars);
  }
  const room = maxChars - header.length - 1;
  return `${header}\n${truncateWithEllipsis(body, room)}`;
}

function truncateWithEllipsis(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 3)}...`;
}
