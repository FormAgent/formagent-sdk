/**
 * Path access controls for built-in tools
 * @module formagent-sdk/tools/builtin/path-guard
 */

import { isAbsolute, normalize, resolve, sep } from "node:path"

import type { BuiltinToolOptions } from "./types"

function withTrailingSep(p: string): string {
  const n = normalize(p)
  return n.endsWith(sep) ? n : n + sep
}

function isSubpath(parentDir: string, childPath: string): boolean {
  const parent = withTrailingSep(resolve(parentDir))
  const child = resolve(childPath)
  return child === parent.slice(0, -1) || child.startsWith(parent)
}

function getDefaultAllowedPaths(options: BuiltinToolOptions): string[] {
  const cwd = options.cwd ?? process.cwd()
  return [cwd]
}

export function validateAbsolutePath(filePath: string): { ok: true; resolved: string } | { ok: false; error: string } {
  if (!isAbsolute(filePath)) {
    return { ok: false, error: `Invalid path: ${filePath}. Must be an absolute path.` }
  }
  return { ok: true, resolved: resolve(filePath) }
}

export function checkPathAccess(
  filePath: string,
  options: BuiltinToolOptions,
  kind: "file" | "dir" = "file"
): { ok: true; resolved: string } | { ok: false; error: string } {
  const abs = validateAbsolutePath(filePath)
  if (!abs.ok) return abs

  const resolved = abs.resolved
  const blockedPaths = options.blockedPaths ?? []
  for (const blocked of blockedPaths) {
    if (isSubpath(blocked, resolved)) {
      return { ok: false, error: `Path is blocked: ${resolved}` }
    }
  }

  const allowedPaths = options.allowedPaths ?? getDefaultAllowedPaths(options)
  const allowed = allowedPaths.some((allowedPath) => isSubpath(allowedPath, resolved))
  if (!allowed) {
    const base = options.cwd ?? process.cwd()
    return {
      ok: false,
      error: `Access denied: ${kind} path is outside allowedPaths.\nPath: ${resolved}\nAllowed: ${allowedPaths.join(", ")}\nHint: configure tools with createBuiltinTools({ allowedPaths: ["${base}"] })`,
    }
  }

  return { ok: true, resolved }
}

export function checkDirAccess(
  dirPath: string,
  options: BuiltinToolOptions
): { ok: true; resolved: string } | { ok: false; error: string } {
  return checkPathAccess(dirPath, options, "dir")
}

