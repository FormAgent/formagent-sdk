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
  WebSearchInput,
  TodoItem,
  TodoWriteInput,
  AskUserOption,
  AskUserQuestion,
  AskUserInput,
  BatchToolCall,
  BatchInput,
  HttpMethod,
  HttpRequestInput,
} from "./types"

// Individual tool exports
export { BashTool, createBashTool } from "./bash"
export { ReadTool, createReadTool } from "./read"
export { WriteTool, createWriteTool } from "./write"
export { EditTool, createEditTool } from "./edit"
export { GlobTool, createGlobTool } from "./glob"
export { GrepTool, createGrepTool } from "./grep"
export { WebFetchTool, createWebFetchTool } from "./webfetch"
export { WebSearchTool, createWebSearchTool } from "./websearch"
export {
  TodoWriteTool,
  createTodoWriteTool,
  getTodos,
  clearTodos,
  setTodoChangeCallback,
} from "./todo"
export {
  AskUserTool,
  createAskUserTool,
  setAskUserHandler,
  getAskUserHandler,
} from "./askuser"
export type { AskUserHandler, AskUserAnswer } from "./askuser"
export {
  BatchTool,
  createBatchTool,
  setBatchToolResolver,
  getBatchToolResolver,
} from "./batch"
export type { BatchToolResolver, BatchCallResult } from "./batch"
export { HttpRequestTool, createHttpRequestTool } from "./httprequest"

// Import tools for collection
import { BashTool } from "./bash"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { WebFetchTool } from "./webfetch"
import { WebSearchTool } from "./websearch"
import { TodoWriteTool } from "./todo"
import { AskUserTool } from "./askuser"
import { BatchTool } from "./batch"
import { HttpRequestTool } from "./httprequest"

import type { ToolDefinition } from "../../types/tool"
import type { BuiltinToolOptions } from "./types"

import { createBashTool } from "./bash"
import { createReadTool } from "./read"
import { createWriteTool } from "./write"
import { createEditTool } from "./edit"
import { createGlobTool } from "./glob"
import { createGrepTool } from "./grep"
import { createWebFetchTool } from "./webfetch"
import { createWebSearchTool } from "./websearch"
import { createTodoWriteTool } from "./todo"
import { createAskUserTool } from "./askuser"
import { createBatchTool } from "./batch"
import { createHttpRequestTool } from "./httprequest"

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
  WebSearchTool,
  HttpRequestTool,
  TodoWriteTool,
  AskUserTool,
  BatchTool,
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
 * Web-related tools (fetch and search)
 *
 * @example
 * ```ts
 * import { webTools } from "formagent-sdk"
 *
 * const session = await createSession({
 *   model: "claude-sonnet-4-20250514",
 *   tools: [...fileTools, ...webTools],
 * })
 * ```
 */
export const webTools: ToolDefinition[] = [WebFetchTool, WebSearchTool, HttpRequestTool]

/**
 * API and HTTP tools for external service integration
 *
 * @example
 * ```ts
 * import { apiTools } from "formagent-sdk"
 *
 * const session = await createSession({
 *   model: "claude-sonnet-4-20250514",
 *   tools: [...fileTools, ...apiTools],
 * })
 * ```
 */
export const apiTools: ToolDefinition[] = [HttpRequestTool, WebFetchTool, WebSearchTool]

/**
 * Interactive tools for user communication
 */
export const interactiveTools: ToolDefinition[] = [AskUserTool]

/**
 * Utility tools for orchestration
 */
export const utilityTools: ToolDefinition[] = [BatchTool, TodoWriteTool]

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
    createWebSearchTool(options),
    createHttpRequestTool(options),
    createTodoWriteTool(options),
    createAskUserTool(options),
    createBatchTool(options),
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

/**
 * Create web-related tools with custom options
 *
 * @param options - Tool configuration options
 * @returns Array of configured web tool definitions
 *
 * @example
 * ```ts
 * const webTools = createWebTools({
 *   allowPrivateNetwork: false,
 * })
 *
 * const session = await createSession({
 *   model: "claude-sonnet-4-20250514",
 *   tools: [...fileTools, ...webTools],
 * })
 * ```
 */
export function createWebTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [createWebFetchTool(options), createWebSearchTool(options), createHttpRequestTool(options)]
}

/**
 * Create API/HTTP tools with custom options
 */
export function createApiTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [createHttpRequestTool(options), createWebFetchTool(options), createWebSearchTool(options)]
}

/**
 * Create interactive tools with custom options
 */
export function createInteractiveTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [createAskUserTool(options)]
}

/**
 * Create utility tools with custom options
 */
export function createUtilityTools(options: BuiltinToolOptions = {}): ToolDefinition[] {
  return [createBatchTool(options), createTodoWriteTool(options)]
}
