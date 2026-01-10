/**
 * Built-in tools for Claude Agent SDK compatibility
 * @module formagent-sdk/tools/builtin
 */

// Types
export type {
  BuiltinToolContext,
  BuiltinToolOptions,
  BashInput,
  ReadInput,
  WriteInput,
  EditInput,
  GlobInput,
  GrepInput,
  WebFetchInput,
  TodoItem,
  TodoWriteInput,
} from "./types"

// Individual tool exports
export { BashTool, createBashTool } from "./bash"
export { ReadTool, createReadTool } from "./read"
export { WriteTool, createWriteTool } from "./write"
export { EditTool, createEditTool } from "./edit"
export { GlobTool, createGlobTool } from "./glob"
export { GrepTool, createGrepTool } from "./grep"
export { WebFetchTool, createWebFetchTool } from "./webfetch"
export {
  TodoWriteTool,
  createTodoWriteTool,
  getTodos,
  clearTodos,
  setTodoChangeCallback,
} from "./todo"

// Import tools for collection
import { BashTool } from "./bash"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { WebFetchTool } from "./webfetch"
import { TodoWriteTool } from "./todo"

import type { ToolDefinition } from "../../types/tool"
import type { BuiltinToolOptions } from "./types"

import { createBashTool } from "./bash"
import { createReadTool } from "./read"
import { createWriteTool } from "./write"
import { createEditTool } from "./edit"
import { createGlobTool } from "./glob"
import { createGrepTool } from "./grep"
import { createWebFetchTool } from "./webfetch"
import { createTodoWriteTool } from "./todo"

/**
 * Collection of all built-in tools (default instances)
 *
 * @example
 * ```ts
 * import { builtinTools } from "formagent-sdk"
 *
 * const session = await createSession({
 *   model: "claude-sonnet-4-20250514",
 *   tools: builtinTools,
 * })
 * ```
 */
export const builtinTools: ToolDefinition[] = [
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  TodoWriteTool,
]

/**
 * Core file operation tools
 */
export const fileTools: ToolDefinition[] = [
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
]

/**
 * Create all built-in tools with custom options
 *
 * @param options - Tool configuration options
 * @returns Array of configured tool definitions
 *
 * @example
 * ```ts
 * const tools = createBuiltinTools({
 *   cwd: "/path/to/project",
 *   defaultTimeout: 60000,
 *   blockedPaths: ["/etc", "/root"],
 * })
 *
 * const session = await createSession({
 *   model: "claude-sonnet-4-20250514",
 *   tools,
 * })
 * ```
 */
export function createBuiltinTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [
    createBashTool(options),
    createReadTool(options),
    createWriteTool(options),
    createEditTool(options),
    createGlobTool(options),
    createGrepTool(options),
    createWebFetchTool(options),
    createTodoWriteTool(options),
  ]
}

/**
 * Create file operation tools with custom options
 */
export function createFileTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [
    createReadTool(options),
    createWriteTool(options),
    createEditTool(options),
    createGlobTool(options),
    createGrepTool(options),
  ]
}
