/**
 * Built-in tool types
 * @module formagent-sdk/tools/builtin/types
 */

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"

/**
 * Built-in tool execution context
 */
export interface BuiltinToolContext extends ToolContext {
  /** Working directory for file operations */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Whether to allow dangerous operations */
  allowDangerous?: boolean
}

/**
 * Bash tool input
 */
export interface BashInput {
  /** Command to execute */
  command: string
  /** Working directory */
  cwd?: string
  /** Timeout in milliseconds */
  timeout?: number
  /** Description of what the command does */
  description?: string
}

/**
 * Read tool input
 */
export interface ReadInput {
  /** Absolute file path to read */
  file_path: string
  /** Line offset to start reading from (1-indexed) */
  offset?: number
  /** Number of lines to read */
  limit?: number
}

/**
 * Write tool input
 */
export interface WriteInput {
  /** Absolute file path to write */
  file_path: string
  /** Content to write */
  content: string
}

/**
 * Edit tool input
 */
export interface EditInput {
  /** Absolute file path to edit */
  file_path: string
  /** Text to find and replace */
  old_string: string
  /** Replacement text */
  new_string: string
  /** Replace all occurrences (default: false) */
  replace_all?: boolean
}

/**
 * Glob tool input
 */
export interface GlobInput {
  /** Glob pattern to match */
  pattern: string
  /** Directory to search in */
  path?: string
}

/**
 * Grep tool input
 */
export interface GrepInput {
  /** Regular expression pattern to search */
  pattern: string
  /** File or directory to search in */
  path?: string
  /** Glob pattern to filter files */
  glob?: string
  /** Include N lines before match */
  before?: number
  /** Include N lines after match */
  after?: number
  /** Case insensitive search */
  ignoreCase?: boolean
}

/**
 * WebFetch tool input
 */
export interface WebFetchInput {
  /** URL to fetch */
  url: string
  /** Prompt to process the content */
  prompt?: string
}

/**
 * WebSearch tool input
 */
export interface WebSearchInput {
  /** Search query */
  query: string
  /** Number of search results to return (default: 8) */
  numResults?: number
  /**
   * Live crawl mode:
   * - 'fallback': use live crawling as backup if cached content unavailable (default)
   * - 'preferred': prioritize live crawling for fresh content
   */
  livecrawl?: "fallback" | "preferred"
  /**
   * Search type:
   * - 'auto': balanced search (default)
   * - 'fast': quick results, less comprehensive
   * - 'deep': comprehensive search, slower
   */
  type?: "auto" | "fast" | "deep"
  /** Maximum characters for context (optimized for LLMs, default: 10000) */
  contextMaxCharacters?: number
}

/**
 * Todo item for TodoWrite tool
 */
export interface TodoItem {
  /** Task content */
  content: string
  /** Task status */
  status: "pending" | "in_progress" | "completed"
  /** Active form of the task (present continuous) */
  activeForm: string
}

/**
 * TodoWrite tool input
 */
export interface TodoWriteInput {
  /** Updated todo list */
  todos: TodoItem[]
}

/**
 * AskUser question option
 */
export interface AskUserOption {
  /** Display label for the option */
  label: string
  /** Description of what this option means */
  description?: string
  /** Value to return if selected (defaults to label) */
  value?: string
}

/**
 * AskUser question definition
 */
export interface AskUserQuestion {
  /** The question text to display to the user */
  question: string
  /** Short label for the question */
  header?: string
  /** Available options for the user to choose from */
  options?: AskUserOption[]
  /** Allow multiple selections (default: false) */
  multiSelect?: boolean
  /** Default value if user doesn't respond */
  defaultValue?: string
}

/**
 * AskUser tool input
 */
export interface AskUserInput {
  /** Questions to ask the user (1-4 questions) */
  questions: AskUserQuestion[]
}

/**
 * Single tool call in a batch
 */
export interface BatchToolCall {
  /** Name of the tool to execute */
  tool: string
  /** Parameters for the tool */
  parameters: Record<string, unknown>
}

/**
 * Batch tool input
 */
export interface BatchInput {
  /** Array of tool calls to execute in parallel (max 10) */
  tool_calls: BatchToolCall[]
}

/**
 * HTTP request method
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

/**
 * HttpRequest tool input
 */
export interface HttpRequestInput {
  /** HTTP method */
  method: HttpMethod
  /** URL to request */
  url: string
  /** Request headers */
  headers?: Record<string, string>
  /** Request body (for POST/PUT/PATCH) */
  body?: unknown
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Expected response type: 'json' | 'text' | 'binary' */
  responseType?: "json" | "text" | "binary"
}

/**
 * Built-in tool factory options
 */
export interface BuiltinToolOptions {
  /** Default working directory */
  cwd?: string
  /** Default timeout for commands (ms) */
  defaultTimeout?: number
  /** Idle timeout for Bash commands (ms) - kills command if no output for this duration */
  idleTimeout?: number
  /** Maximum file size to read (bytes) */
  maxFileSize?: number
  /** Allowed directories for file operations */
  allowedPaths?: string[]
  /** Blocked directories for file operations */
  blockedPaths?: string[]
  /**
   * Allow potentially dangerous operations (Bash + expanded access).
   * When false (default), built-in tools apply a safe-by-default policy:
   * - file operations are restricted to allowedPaths (defaults to cwd)
   * - Bash denies obvious high-risk command patterns
   */
  allowDangerous?: boolean
  /** Additional regex patterns (as strings) to block for Bash commands */
  blockedCommandPatterns?: string[]
  /** WebFetch: allow localhost/private/link-local targets */
  allowPrivateNetwork?: boolean
  /** WebFetch: resolve hostname to IPs and block private ranges (default true) */
  resolveHostnames?: boolean
}
