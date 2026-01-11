/**
 * Output truncation utilities
 * Prevents token explosion from verbose tool outputs
 * @module formagent-sdk/utils/truncation
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

/**
 * Truncation configuration
 */
export interface TruncationConfig {
  /** Maximum number of lines before truncation (default: 2000) */
  maxLines?: number
  /** Maximum bytes before truncation (default: 50KB) */
  maxBytes?: number
  /** Direction to keep content from: 'head' keeps beginning, 'tail' keeps end */
  direction?: "head" | "tail"
  /** Whether to save full content to temp file (default: true) */
  saveToFile?: boolean
  /** Custom temp directory (default: system temp) */
  tempDir?: string
}

/**
 * Truncation result
 */
export interface TruncationResult {
  /** The (possibly truncated) content */
  content: string
  /** Whether truncation occurred */
  truncated: boolean
  /** Path to full content file (if truncated and saved) */
  outputPath?: string
  /** Original size in bytes */
  originalBytes: number
  /** Original line count */
  originalLines: number
  /** Truncated size in bytes */
  truncatedBytes?: number
  /** Truncated line count */
  truncatedLines?: number
}

/**
 * Default truncation limits
 */
export const TRUNCATION_DEFAULTS = {
  MAX_LINES: 2000,
  MAX_BYTES: 50 * 1024, // 50KB
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const

/**
 * Get the temp directory for truncated outputs
 */
function getTempDir(config?: TruncationConfig): string {
  return config?.tempDir ?? path.join(os.tmpdir(), "formagent-sdk-output")
}

/**
 * Generate a unique filename for truncated output
 */
function generateOutputFilename(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `tool_${timestamp}_${random}.txt`
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Directory may already exist
  }
}

/**
 * Cleanup old truncated output files
 */
export async function cleanupTruncatedOutputs(config?: TruncationConfig): Promise<number> {
  const dir = getTempDir(config)
  const cutoff = Date.now() - TRUNCATION_DEFAULTS.RETENTION_MS

  let cleaned = 0

  try {
    const files = await fs.readdir(dir)

    for (const file of files) {
      if (!file.startsWith("tool_")) continue

      // Extract timestamp from filename (tool_TIMESTAMP_RANDOM.txt)
      const match = file.match(/^tool_(\d+)_/)
      if (!match) continue

      const timestamp = parseInt(match[1], 10)
      if (timestamp < cutoff) {
        try {
          await fs.unlink(path.join(dir, file))
          cleaned++
        } catch {
          // Ignore deletion errors
        }
      }
    }
  } catch {
    // Directory may not exist yet
  }

  return cleaned
}

/**
 * Truncate output if it exceeds limits
 *
 * @param text - The text to potentially truncate
 * @param config - Truncation configuration
 * @returns Truncation result with content and metadata
 *
 * @example
 * ```ts
 * const result = await truncateOutput(longToolOutput, {
 *   maxLines: 1000,
 *   maxBytes: 32 * 1024,
 *   direction: 'head',
 * })
 *
 * if (result.truncated) {
 *   console.log(`Output truncated, full content at: ${result.outputPath}`)
 * }
 * ```
 */
export async function truncateOutput(
  text: string,
  config: TruncationConfig = {}
): Promise<TruncationResult> {
  const maxLines = config.maxLines ?? TRUNCATION_DEFAULTS.MAX_LINES
  const maxBytes = config.maxBytes ?? TRUNCATION_DEFAULTS.MAX_BYTES
  const direction = config.direction ?? "head"
  const saveToFile = config.saveToFile ?? true

  const lines = text.split("\n")
  const totalBytes = Buffer.byteLength(text, "utf-8")

  // Check if truncation is needed
  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return {
      content: text,
      truncated: false,
      originalBytes: totalBytes,
      originalLines: lines.length,
    }
  }

  // Perform truncation
  const out: string[] = []
  let bytes = 0
  let hitBytes = false

  if (direction === "head") {
    for (let i = 0; i < lines.length && i < maxLines; i++) {
      const lineBytes = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0) // +1 for newline
      if (bytes + lineBytes > maxBytes) {
        hitBytes = true
        break
      }
      out.push(lines[i])
      bytes += lineBytes
    }
  } else {
    // tail: keep the end
    for (let i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
      const lineBytes = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
      if (bytes + lineBytes > maxBytes) {
        hitBytes = true
        break
      }
      out.unshift(lines[i])
      bytes += lineBytes
    }
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
  const unit = hitBytes ? "bytes" : "lines"
  const preview = out.join("\n")

  // Save full content to file if enabled
  let outputPath: string | undefined
  if (saveToFile) {
    const dir = getTempDir(config)
    await ensureTempDir(dir)
    outputPath = path.join(dir, generateOutputFilename())
    await fs.writeFile(outputPath, text, "utf-8")
  }

  // Build truncated message
  const hint = outputPath
    ? `Full output saved to: ${outputPath}\nUse Read tool with offset/limit to view specific sections, or Grep to search the content.`
    : "Output was truncated. Consider using more specific queries."

  const message =
    direction === "head"
      ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
      : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`

  return {
    content: message,
    truncated: true,
    outputPath,
    originalBytes: totalBytes,
    originalLines: lines.length,
    truncatedBytes: bytes,
    truncatedLines: out.length,
  }
}

/**
 * Truncate tool output with sensible defaults
 *
 * A convenience wrapper around truncateOutput with tool-specific defaults.
 *
 * @param output - Tool output content
 * @param config - Optional configuration overrides
 * @returns Truncated content string
 */
export async function truncateToolOutput(
  output: string,
  config?: Partial<TruncationConfig>
): Promise<string> {
  const result = await truncateOutput(output, config)
  return result.content
}

/**
 * Check if content needs truncation
 *
 * @param text - The text to check
 * @param config - Truncation configuration
 * @returns True if content exceeds limits
 */
export function needsTruncation(text: string, config: TruncationConfig = {}): boolean {
  const maxLines = config.maxLines ?? TRUNCATION_DEFAULTS.MAX_LINES
  const maxBytes = config.maxBytes ?? TRUNCATION_DEFAULTS.MAX_BYTES

  const lines = text.split("\n")
  const bytes = Buffer.byteLength(text, "utf-8")

  return lines.length > maxLines || bytes > maxBytes
}
