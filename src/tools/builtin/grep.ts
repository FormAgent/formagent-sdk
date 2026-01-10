/**
 * Grep tool implementation
 * @module formagent-sdk/tools/builtin/grep
 */

import { readFile, readdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, extname } from "node:path"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { GrepInput, BuiltinToolOptions } from "./types"
import { checkPathAccess } from "./path-guard"

const MAX_RESULTS = 500
const MAX_LINE_LENGTH = 500

/**
 * Binary file extensions to skip
 */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".lock",
])

/**
 * Simple glob pattern matcher for file filtering
 */
function matchGlob(pattern: string, filename: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/\./g, "\\.")

  return new RegExp(`^${regexPattern}$`).test(filename)
}

interface GrepMatch {
  file: string
  line: number
  content: string
  before?: string[]
  after?: string[]
}

/**
 * Search a single file
 */
async function searchFile(
  filePath: string,
  regex: RegExp,
  before: number,
  after: number
): Promise<GrepMatch[]> {
  const matches: GrepMatch[] = []

  try {
    const content = await readFile(filePath, "utf-8")
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        const match: GrepMatch = {
          file: filePath,
          line: i + 1,
          content: lines[i].slice(0, MAX_LINE_LENGTH),
        }

        // Add context lines
        if (before > 0) {
          match.before = lines
            .slice(Math.max(0, i - before), i)
            .map((l) => l.slice(0, MAX_LINE_LENGTH))
        }
        if (after > 0) {
          match.after = lines
            .slice(i + 1, i + 1 + after)
            .map((l) => l.slice(0, MAX_LINE_LENGTH))
        }

        matches.push(match)

        if (matches.length >= MAX_RESULTS) {
          break
        }
      }
    }
  } catch {
    // Ignore files that can't be read
  }

  return matches
}

/**
 * Recursively search directory
 */
async function searchDir(
  dir: string,
  regex: RegExp,
  glob: string | undefined,
  before: number,
  after: number,
  results: GrepMatch[],
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<void> {
  if (currentDepth > maxDepth || results.length >= MAX_RESULTS) {
    return
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break

      // Skip hidden files and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue
      }

      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        await searchDir(fullPath, regex, glob, before, after, results, maxDepth, currentDepth + 1)
      } else if (entry.isFile()) {
        // Skip binary files
        const ext = extname(entry.name).toLowerCase()
        if (BINARY_EXTENSIONS.has(ext)) {
          continue
        }

        // Apply glob filter
        if (glob && !matchGlob(glob, entry.name)) {
          continue
        }

        const matches = await searchFile(fullPath, regex, before, after)
        results.push(...matches)
      }
    }
  } catch {
    // Ignore permission errors
  }
}

/**
 * Create the Grep tool
 */
export function createGrepTool(options: BuiltinToolOptions = {}): ToolDefinition {
  const defaultCwd = options.cwd ?? process.cwd()

  return {
    name: "Grep",
    description: `Search file contents using regular expressions. Supports context lines before/after matches. Returns matching lines with file paths and line numbers.`,
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for",
        },
        path: {
          type: "string",
          description: "File or directory to search in",
        },
        glob: {
          type: "string",
          description: 'Glob pattern to filter files (e.g., "*.ts")',
        },
        before: {
          type: "number",
          description: "Number of lines to show before each match",
        },
        after: {
          type: "number",
          description: "Number of lines to show after each match",
        },
        ignoreCase: {
          type: "boolean",
          description: "Case insensitive search",
        },
      },
      required: ["pattern"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as GrepInput
      const {
        pattern,
        path = defaultCwd,
        glob,
        before = 0,
        after = 0,
        ignoreCase = false,
      } = input

      const access = checkPathAccess(path, options, "dir")
      if (!access.ok) {
        return { content: access.error, isError: true }
      }

      if (!existsSync(access.resolved)) {
        return {
          content: `Path not found: ${access.resolved}`,
          isError: true,
        }
      }

      try {
        const flags = ignoreCase ? "gi" : "g"
        const regex = new RegExp(pattern, flags)
        const results: GrepMatch[] = []

        const pathStat = await stat(access.resolved)

        if (pathStat.isFile()) {
          const matches = await searchFile(access.resolved, regex, before, after)
          results.push(...matches)
        } else if (pathStat.isDirectory()) {
          await searchDir(access.resolved, regex, glob, before, after, results)
        }

        if (results.length === 0) {
          return {
            content: `No matches found for pattern: ${pattern}`,
          }
        }

        // Format output
        const output: string[] = []
        for (const match of results) {
          if (match.before?.length) {
            for (let i = 0; i < match.before.length; i++) {
              const lineNum = match.line - match.before.length + i
              output.push(`${match.file}:${lineNum}- ${match.before[i]}`)
            }
          }

          output.push(`${match.file}:${match.line}: ${match.content}`)

          if (match.after?.length) {
            for (let i = 0; i < match.after.length; i++) {
              const lineNum = match.line + i + 1
              output.push(`${match.file}:${lineNum}+ ${match.after[i]}`)
            }
          }

          // Add separator between matches from different locations
          if (match.before?.length || match.after?.length) {
            output.push("--")
          }
        }

        const truncated = results.length >= MAX_RESULTS
          ? `\n\n(Results truncated at ${MAX_RESULTS} matches)`
          : ""

        return {
          content: `Found ${results.length} matches:\n\n${output.join("\n")}${truncated}`,
        }
      } catch (error) {
        return {
          content: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default Grep tool instance
 */
export const GrepTool = createGrepTool()
