/**
 * Bash tool implementation
 * @module formagent-sdk/tools/builtin/bash
 */

import { spawn, type ChildProcess } from "node:child_process"
import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { BashInput, BuiltinToolOptions } from "./types"
import { checkDirAccess } from "./path-guard"

const DEFAULT_TIMEOUT = 120000 // 2 minutes
const MAX_OUTPUT_LENGTH = 100000
const DEFAULT_BLOCKED_PATTERNS = [
  "\\bsudo\\b",
  "\\bmkfs\\b",
  "\\bdd\\s+if=",
  "\\brm\\s+-rf\\s+/(\\s|$)",
  "\\bshutdown\\b",
  "\\breboot\\b",
  "\\bpoweroff\\b",
]

/**
 * Create the Bash tool
 */
export function createBashTool(options: BuiltinToolOptions = {}): ToolDefinition {
  const defaultCwd = options.cwd ?? process.cwd()
  const defaultTimeout = options.defaultTimeout ?? DEFAULT_TIMEOUT
  const blockedPatterns = [
    ...DEFAULT_BLOCKED_PATTERNS,
    ...(options.blockedCommandPatterns ?? []),
  ].map((p) => {
    try {
      return new RegExp(p, "i")
    } catch {
      return null
    }
  }).filter((r): r is RegExp => r !== null)

  return {
    name: "Bash",
    description: `Execute bash commands in a persistent shell session. Use for git, npm, docker, and other CLI operations. Avoid using for file operations (use Read/Write/Edit instead).`,
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
        cwd: {
          type: "string",
          description: "Working directory for the command",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (max 600000)",
        },
        description: {
          type: "string",
          description: "Brief description of what this command does",
        },
      },
      required: ["command"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as BashInput
      const { command, cwd = defaultCwd, timeout = defaultTimeout } = input

      const cwdAccess = checkDirAccess(cwd, options)
      if (!cwdAccess.ok) {
        return { content: cwdAccess.error, isError: true }
      }

      if (!options.allowDangerous) {
        for (const pattern of blockedPatterns) {
          if (pattern.test(command)) {
            return {
              content: `Command blocked by policy (allowDangerous=false): matched /${pattern.source}/`,
              isError: true,
            }
          }
        }
      }

      // Validate timeout
      const actualTimeout = Math.min(timeout, 600000)

      return new Promise((resolve) => {
        let stdout = ""
        let stderr = ""
        let killed = false

        const proc: ChildProcess = spawn("bash", ["-c", command], {
          cwd: cwdAccess.resolved,
          env: process.env,
          shell: false,
        })

        const timer = setTimeout(() => {
          killed = true
          proc.kill("SIGTERM")
          setTimeout(() => proc.kill("SIGKILL"), 1000)
        }, actualTimeout)

        proc.stdout?.on("data", (data: Buffer) => {
          stdout += data.toString()
          if (stdout.length > MAX_OUTPUT_LENGTH) {
            stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + "\n... (output truncated)"
            proc.kill("SIGTERM")
          }
        })

        proc.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString()
          if (stderr.length > MAX_OUTPUT_LENGTH) {
            stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + "\n... (output truncated)"
          }
        })

        proc.on("close", (code: number | null) => {
          clearTimeout(timer)

          if (killed) {
            resolve({
              content: `Command timed out after ${actualTimeout}ms\n\nPartial output:\n${stdout}\n\nStderr:\n${stderr}`,
              isError: true,
            })
            return
          }

          const output = stdout + (stderr ? `\nStderr:\n${stderr}` : "")

          if (code !== 0) {
            resolve({
              content: `Command failed with exit code ${code}\n\n${output}`,
              isError: true,
            })
          } else {
            resolve({
              content: output || "(no output)",
            })
          }
        })

        proc.on("error", (error: Error) => {
          clearTimeout(timer)
          resolve({
            content: `Failed to execute command: ${error.message}`,
            isError: true,
          })
        })
      })
    },
  }
}

/**
 * Default Bash tool instance
 */
export const BashTool = createBashTool()
