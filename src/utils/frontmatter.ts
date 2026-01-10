/**
 * Frontmatter parsing utilities for SKILL.md and CLAUDE.md files
 * @module formagent-sdk/utils/frontmatter
 */

/**
 * Parsed frontmatter result
 */
export interface FrontmatterResult<T = Record<string, unknown>> {
  /** Parsed frontmatter data */
  data: T
  /** Content after frontmatter */
  content: string
  /** Raw frontmatter string */
  raw?: string
}

/**
 * Parse YAML-like frontmatter from markdown content
 *
 * Supports a subset of YAML:
 * - String values (quoted or unquoted)
 * - Arrays (inline [...] or multi-line with -)
 * - Boolean values (true/false)
 * - Number values
 * - Nested objects (single level)
 *
 * @param input - Markdown content with optional frontmatter
 * @returns Parsed frontmatter and remaining content
 *
 * @example
 * ```ts
 * const input = `---
 * name: My Skill
 * description: "A helpful skill"
 * tags: [ai, coding]
 * enabled: true
 * ---
 * # Skill Content
 * This is the skill body.
 * `
 *
 * const result = parseFrontmatter(input)
 * // result.data = { name: "My Skill", description: "A helpful skill", tags: ["ai", "coding"], enabled: true }
 * // result.content = "# Skill Content\nThis is the skill body.\n"
 * ```
 */
export function parseFrontmatter<T = Record<string, unknown>>(input: string): FrontmatterResult<T> {
  const trimmed = input.trim()

  // Check if content starts with frontmatter delimiter
  if (!trimmed.startsWith("---")) {
    return {
      data: {} as T,
      content: input,
    }
  }

  // Find the closing delimiter
  const endIndex = trimmed.indexOf("\n---", 3)
  if (endIndex === -1) {
    return {
      data: {} as T,
      content: input,
    }
  }

  // Extract frontmatter and content
  const raw = trimmed.slice(4, endIndex).trim()
  const content = trimmed.slice(endIndex + 4).trim()

  // Parse the frontmatter
  const data = parseYamlLike(raw)

  return {
    data: data as T,
    content,
    raw,
  }
}

/**
 * Parse YAML-like key-value pairs
 */
function parseYamlLike(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split("\n")

  let currentKey: string | null = null
  let currentArray: unknown[] | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    // Check for array item (continuation of previous key)
    if (trimmedLine.startsWith("- ") && currentKey && currentArray) {
      const value = parseValue(trimmedLine.slice(2).trim())
      currentArray.push(value)
      continue
    }

    // Parse key-value pair
    const colonIndex = trimmedLine.indexOf(":")
    if (colonIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, colonIndex).trim()
    const rawValue = trimmedLine.slice(colonIndex + 1).trim()

    // Check if value is on next line (array or object)
    if (!rawValue) {
      currentKey = key
      currentArray = []
      result[key] = currentArray
      continue
    }

    // Reset array tracking
    currentKey = null
    currentArray = null

    // Parse the value
    result[key] = parseValue(rawValue)
  }

  return result
}

/**
 * Parse a single value from YAML-like format
 */
function parseValue(raw: string): unknown {
  const trimmed = raw.trim()

  // Empty value
  if (!trimmed) {
    return ""
  }

  // Null
  if (trimmed === "null" || trimmed === "~") {
    return null
  }

  // Boolean
  if (trimmed === "true") {
    return true
  }
  if (trimmed === "false") {
    return false
  }

  // Inline array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) {
      return []
    }
    return inner.split(",").map((item) => parseValue(item.trim()))
  }

  // Quoted string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  // Number
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== "") {
    return num
  }

  // Plain string
  return trimmed
}

/**
 * Serialize data to frontmatter format
 *
 * @param data - Data to serialize
 * @returns YAML-like frontmatter string (without delimiters)
 *
 * @example
 * ```ts
 * const yaml = serializeFrontmatter({
 *   name: "My Skill",
 *   tags: ["ai", "coding"],
 *   enabled: true
 * })
 * // "name: My Skill\ntags: [ai, coding]\nenabled: true"
 * ```
 */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue
    }

    lines.push(`${key}: ${serializeValue(value)}`)
  }

  return lines.join("\n")
}

/**
 * Serialize a single value to YAML-like format
 */
function serializeValue(value: unknown): string {
  if (value === null) {
    return "null"
  }

  if (typeof value === "boolean") {
    return value.toString()
  }

  if (typeof value === "number") {
    return value.toString()
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serializeValue(item))
    return `[${items.join(", ")}]`
  }

  if (typeof value === "string") {
    // Quote strings that need it
    if (value.includes(":") || value.includes("#") || value.includes("\n") || /^[\[\]{},]/.test(value)) {
      return `"${value.replace(/"/g, '\\"')}"`
    }
    return value
  }

  // Objects are not supported in simple serialization
  return String(value)
}

/**
 * Create a markdown file with frontmatter
 *
 * @param data - Frontmatter data
 * @param content - Markdown content
 * @returns Complete markdown string with frontmatter
 *
 * @example
 * ```ts
 * const markdown = createWithFrontmatter(
 *   { name: "My Skill", version: "1.0" },
 *   "# My Skill\n\nThis is the content."
 * )
 * ```
 */
export function createWithFrontmatter(data: Record<string, unknown>, content: string): string {
  const frontmatter = serializeFrontmatter(data)
  return `---\n${frontmatter}\n---\n\n${content}`
}

/**
 * Extract title from markdown content (first H1)
 *
 * @param content - Markdown content
 * @returns Title string or undefined
 */
export function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : undefined
}

/**
 * Extract description from markdown content (first paragraph after title)
 *
 * @param content - Markdown content
 * @returns Description string or undefined
 */
export function extractDescription(content: string): string | undefined {
  // Remove title if present
  const withoutTitle = content.replace(/^#\s+.+\n+/, "")

  // Find first non-empty paragraph
  const paragraphs = withoutTitle.split(/\n\n+/)
  for (const p of paragraphs) {
    const trimmed = p.trim()
    // Skip headings and code blocks
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("```")) {
      return trimmed
    }
  }

  return undefined
}
