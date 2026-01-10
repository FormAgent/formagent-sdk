/**
 * Glob tool implementation
 * @module formagent-sdk/tools/builtin/glob
 */

import { readdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, relative } from "node:path"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { GlobInput, BuiltinToolOptions } from "./types"
import { checkDirAccess } from "./path-guard"

const MAX_RESULTS = 1000

/**
 * Simple glob pattern matcher
 */
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\./g, "\\.")

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

/**
 * Recursively scan directory
 */
async function scanDir(
  dir: string,
  pattern: string,
  results: string[],
  baseDir: string,
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<void> {
  if (currentDepth > maxDepth || results.length >= MAX_RESULTS) {
    return
  }

  if (!existsSync(dir)) {
    return
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break

      // Skip hidden files and common ignored directories
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue
      }

      const fullPath = join(dir, entry.name)
      const relativePath = relative(baseDir, fullPath)

      if (entry.isDirectory()) {
        // Check if directory matches pattern (for ** patterns)
        if (matchGlob(pattern, relativePath) || matchGlob(pattern, relativePath + "/")) {
          results.push(fullPath)
        }
        // Recurse into directory
        await scanDir(fullPath, pattern, results, baseDir, maxDepth, currentDepth + 1)
      } else if (entry.isFile()) {
        if (matchGlob(pattern, relativePath)) {
          results.push(fullPath)
        }
      }
    }
  } catch {
    // Ignore permission errors
  }
}

/**
 * Create the Glob tool
 */
export function createGlobTool(options: BuiltinToolOptions = {}): ToolDefinition {
  const defaultCwd = options.cwd ?? process.cwd()

  return {
    name: "Glob",
    description: `Find files matching a glob pattern. Supports ** for recursive matching, * for single directory, ? for single character. Returns file paths sorted by modification time.`,
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern to match (e.g., "**/*.ts", "src/**/*.js")',
        },
        path: {
          type: "string",
          description: "Directory to search in (default: current directory)",
        },
      },
      required: ["pattern"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as GlobInput
      const { pattern, path = defaultCwd } = input

      const access = checkDirAccess(path, options)
      if (!access.ok) {
        return { content: access.error, isError: true }
      }

      if (!existsSync(access.resolved)) {
        return {
          content: `Directory not found: ${access.resolved}`,
          isError: true,
        }
      }

      try {
        const results: string[] = []
        await scanDir(access.resolved, pattern, results, access.resolved)

        if (results.length === 0) {
          return {
            content: `No files found matching pattern: ${pattern}`,
          }
        }

        // Get file stats for sorting
        const filesWithStats = await Promise.all(
          results.map(async (file) => {
            try {
              const stats = await stat(file)
              return { file, mtime: stats.mtime.getTime() }
            } catch {
              return { file, mtime: 0 }
            }
          })
        )

        // Sort by modification time (newest first)
        filesWithStats.sort((a, b) => b.mtime - a.mtime)

        const output = filesWithStats.map((f) => f.file).join("\n")
        const truncated = results.length >= MAX_RESULTS ? `\n\n(Results truncated at ${MAX_RESULTS} files)` : ""

        return {
          content: `Found ${results.length} files:\n\n${output}${truncated}`,
        }
      } catch (error) {
        return {
          content: `Failed to search: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default Glob tool instance
 */
export const GlobTool = createGlobTool()
