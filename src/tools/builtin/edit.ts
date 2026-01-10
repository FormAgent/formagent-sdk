/**
 * Edit tool implementation
 * @module formagent-sdk/tools/builtin/edit
 */

import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { EditInput, BuiltinToolOptions } from "./types"
import { checkPathAccess } from "./path-guard"

/**
 * Create the Edit tool
 */
export function createEditTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "Edit",
    description: `Edit a file by replacing text. Finds old_string and replaces with new_string. The old_string must be unique in the file unless replace_all is true.`,
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "Text to find and replace",
        },
        new_string: {
          type: "string",
          description: "Replacement text",
        },
        replace_all: {
          type: "boolean",
          description: "Replace all occurrences (default: false)",
          default: false,
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as EditInput
      const { file_path, old_string, new_string, replace_all = false } = input

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

      // Validate strings are different
      if (old_string === new_string) {
        return {
          content: `old_string and new_string are identical. No changes needed.`,
          isError: true,
        }
      }

      try {
        const content = await readFile(access.resolved, "utf-8")

        // Count occurrences
        const occurrences = content.split(old_string).length - 1

        if (occurrences === 0) {
          return {
            content: `Text not found in file: "${old_string.slice(0, 100)}${old_string.length > 100 ? "..." : ""}"`,
            isError: true,
          }
        }

        // Check for uniqueness if not replacing all
        if (!replace_all && occurrences > 1) {
          return {
            content: `Found ${occurrences} occurrences of the text. Use replace_all: true to replace all, or provide a more unique string.`,
            isError: true,
          }
        }

        // Perform replacement
        let newContent: string
        let replacedCount: number

        if (replace_all) {
          newContent = content.split(old_string).join(new_string)
          replacedCount = occurrences
        } else {
          newContent = content.replace(old_string, new_string)
          replacedCount = 1
        }

        // Write back
        await writeFile(access.resolved, newContent, "utf-8")

        return {
          content: `Successfully replaced ${replacedCount} occurrence${replacedCount > 1 ? "s" : ""} in ${access.resolved}`,
        }
      } catch (error) {
        return {
          content: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default Edit tool instance
 */
export const EditTool = createEditTool()
