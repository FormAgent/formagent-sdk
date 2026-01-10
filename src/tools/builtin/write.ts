/**
 * Write tool implementation
 * @module formagent-sdk/tools/builtin/write
 */

import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { WriteInput, BuiltinToolOptions } from "./types"
import { checkPathAccess } from "./path-guard"

/**
 * Create the Write tool
 */
export function createWriteTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "Write",
    description: `Write content to a file. Creates parent directories if needed. Overwrites existing files. Use Edit tool for modifying existing files.`,
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as WriteInput
      const { file_path, content } = input

      const access = checkPathAccess(file_path, options, "file")
      if (!access.ok) {
        return { content: access.error, isError: true }
      }

      try {
        // Create parent directory if needed
        const dir = dirname(access.resolved)
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true })
        }

        // Write file
        await writeFile(access.resolved, content, "utf-8")

        const lines = content.split("\n").length
        const bytes = Buffer.byteLength(content, "utf-8")

        return {
          content: `Successfully wrote ${bytes} bytes (${lines} lines) to ${access.resolved}`,
        }
      } catch (error) {
        return {
          content: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default Write tool instance
 */
export const WriteTool = createWriteTool()
