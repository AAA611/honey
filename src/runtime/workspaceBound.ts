import { lstat, realpath } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "node:path";

export type ResolveWithinCwdResult =
  | { ok: true; absolutePath: string }
  | { ok: false; reason: string; attemptedPath: string };

/**
 * Resolve a Tool path argument under Session cwd using realpath semantics.
 * Non-existent paths use the longest existing real prefix plus remaining segments.
 */
export async function resolveWithinCwd(
  cwd: string,
  pathArgument: string
): Promise<ResolveWithinCwdResult> {
  const root = await realpath(cwd);
  const candidate = resolve(root, pathArgument);
  const absolutePath = await resolveRealOrProjected(candidate);

  if (!isInsideRoot(root, absolutePath)) {
    return {
      ok: false,
      reason: `Workspace bound rejected path outside workspace: ${pathArgument}`,
      attemptedPath: absolutePath
    };
  }

  return { ok: true, absolutePath };
}

/**
 * Check pathParams on a Tool call against Workspace bound.
 * Returns the first rejection, or ok when all declared path args are inside cwd.
 * Coerces values with String(...) to match Tool execute semantics.
 */
export async function checkToolCallWorkspaceBound(options: {
  cwd: string;
  pathParams: string[] | undefined;
  arguments: Record<string, unknown>;
}): Promise<ResolveWithinCwdResult | { ok: true }> {
  const pathParams = options.pathParams ?? [];
  for (const key of pathParams) {
    const raw = options.arguments[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = String(raw);
    if (value.length === 0) {
      continue;
    }
    const result = await resolveWithinCwd(options.cwd, value);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

/**
 * Resolve a Tool path, honoring Workspace bound unless explicitly disabled.
 */
export async function resolveToolPath(
  cwd: string,
  pathArgument: string,
  workspaceBound: boolean | undefined
): Promise<ResolveWithinCwdResult> {
  if (workspaceBound === false) {
    return { ok: true, absolutePath: resolve(cwd, pathArgument) };
  }
  return resolveWithinCwd(cwd, pathArgument);
}

/** True when absolutePath is under root after normalization (realpath roots preferred). */
export function isPathInsideRoot(root: string, absolutePath: string): boolean {
  return isInsideRoot(root, absolutePath);
}

async function resolveRealOrProjected(candidate: string): Promise<string> {
  try {
    return await realpath(candidate);
  } catch {
    // Fall through: project from longest existing ancestor.
  }

  let cursor = normalize(candidate);
  const missing: string[] = [];

  while (true) {
    try {
      await lstat(cursor);
      const existingReal = await realpath(cursor);
      return missing.length === 0
        ? existingReal
        : normalize(join(existingReal, ...missing.reverse()));
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) {
        // Filesystem root with nothing existing — treat candidate as-is.
        return normalize(candidate);
      }
      missing.push(cursor.slice(parent.length + 1) || cursor);
      cursor = parent;
    }
  }
}

function isInsideRoot(root: string, absolutePath: string): boolean {
  const normalizedRoot = normalize(root.endsWith(sep) ? root.slice(0, -1) : root);
  const normalizedPath = normalize(absolutePath);
  if (normalizedPath === normalizedRoot) {
    return true;
  }
  const rel = relative(normalizedRoot, normalizedPath);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
