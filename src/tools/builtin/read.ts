/**
 * Read tool implementation
 * @module formagent-sdk/tools/builtin/read
 */

import { readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { extname } from "node:path"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { ReadInput, BuiltinToolOptions } from "./types"
import { checkPathAccess } from "./path-guard"

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_LINE_LIMIT = 2000
const MAX_LINE_LENGTH = 2000

/**
 * Binary file extensions that should not be read as text
 */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
])

/**
 * Create the Read tool
 */
export function createReadTool(options: BuiltinToolOptions = {}): ToolDefinition {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE

  return {
    name: "Read",
    description: `Read file contents. Supports text files with optional line range. Returns line numbers in output. For images/PDFs, returns metadata only.`,
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-indexed)",
        },
        limit: {
          type: "number",
          description: "Number of lines to read (default: 2000)",
        },
      },
      required: ["file_path"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as ReadInput
      const { file_path, offset = 1, limit = DEFAULT_LINE_LIMIT } = input

      const access = checkPathAccess(file_path, options, "file")
      if (!access.ok) {
        return { content: access.error, isError: true }
      }

      // Check if file exists
      if (!existsSync(access.resolved)) {
        return {
          content: `File not found: ${access.resolved}`,
          isError: true,
        }
      }

      // Check file size
      const fileStat = await stat(access.resolved)
      if (fileStat.size > maxFileSize) {
        return {
          content: `File too large: ${fileStat.size} bytes (max: ${maxFileSize} bytes)`,
          isError: true,
        }
      }

      // Check if binary file
      const ext = extname(access.resolved).toLowerCase()
      if (BINARY_EXTENSIONS.has(ext)) {
        return {
          content: `Binary file: ${access.resolved}\nSize: ${fileStat.size} bytes\nType: ${ext}`,
        }
      }

      try {
        const content = await readFile(access.resolved, "utf-8")
        const lines = content.split("\n")

        // Calculate line range
        const startLine = Math.max(1, offset)
        const endLine = Math.min(lines.length, startLine + limit - 1)

        // Format output with line numbers
        const outputLines: string[] = []
        for (let i = startLine - 1; i < endLine; i++) {
          const lineNum = i + 1
          let line = lines[i]

          // Truncate long lines
          if (line.length > MAX_LINE_LENGTH) {
            line = line.slice(0, MAX_LINE_LENGTH) + "..."
          }

          // Format: line_number → content
          const padding = String(endLine).length
          outputLines.push(`${String(lineNum).padStart(padding)}→${line}`)
        }

        // Add range info if not reading from start
        let header = ""
        if (startLine > 1 || endLine < lines.length) {
          header = `[Lines ${startLine}-${endLine} of ${lines.length}]\n\n`
        }

        return {
          content: header + outputLines.join("\n"),
        }
      } catch (error) {
        return {
          content: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default Read tool instance
 */
export const ReadTool = createReadTool()
