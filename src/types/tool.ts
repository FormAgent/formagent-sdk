/**
 * Tool type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/tool
 */

import type { JSONSchema, ContentBlock } from "./core"
import type { Session } from "./session"

// === Tool Definition Types ===

/**
 * Tool definition (Claude SDK compatible)
 */
export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = ToolOutput> {
  /** Unique tool identifier */
  name: string
  /** Tool description (shown to the model) */
  description: string
  /** Input parameter schema (JSON Schema) */
  inputSchema: JSONSchema
  /** Tool execution function */
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>
}

/**
 * Tool context passed to execute function
 */
export interface ToolContext {
  /** Session reference */
  session?: Session
  /** Session ID */
  sessionId: string
  /** Abort signal for cancellation */
  abortSignal: AbortSignal
  /** Report progress (0-100) */
  reportProgress?: (progress: number) => void
  /** Emit custom metadata */
  emitMetadata?: (data: Record<string, unknown>) => void
}

/**
 * Tool output (result of execution)
 */
export interface ToolOutput {
  /** Output content (string or structured) */
  content: string | ContentBlock[]
  /** Whether this is an error result */
  isError?: boolean
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// === Tool Helper Types ===

/**
 * Options for tool() helper function
 */
export interface ToolOptions<TInput> {
  /** Tool name */
  name: string
  /** Tool description */
  description: string
  /** Input schema (JSON Schema or Zod schema) */
  schema: JSONSchema | ZodLikeSchema<TInput>
  /** Execution function */
  execute: (input: TInput, context: ToolContext) => Promise<ToolOutput | string>
}

/**
 * Zod-like schema interface (for type inference)
 */
export interface ZodLikeSchema<T = unknown> {
  parse: (data: unknown) => T
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown }
  _input?: T
  _output?: T
}

// === Tool Registry Types ===

/**
 * Tool registry interface
 */
export interface ToolRegistry {
  /**
   * Register a tool
   * @param tool - Tool definition to register
   */
  register(tool: ToolDefinition): void

  /**
   * Unregister a tool by name
   * @param name - Tool name to unregister
   */
  unregister(name: string): void

  /**
   * Get a tool by name
   * @param name - Tool name
   */
  get(name: string): ToolDefinition | undefined

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[]

  /**
   * Check if a tool is registered
   * @param name - Tool name
   */
  has(name: string): boolean

  /**
   * Clear all registered tools
   */
  clear(): void

  /**
   * Execute a tool by name
   * @param name - Tool name
   * @param input - Tool input
   * @param context - Tool context
   */
  execute(name: string, input: Record<string, unknown>, context: ToolContext): Promise<ToolOutput>
}

// === MCP Types ===

/**
 * MCP (Model Context Protocol) server interface
 */
export interface MCPServer {
  /** Server name */
  name: string
  /** List available tools */
  listTools(): Promise<MCPToolInfo[]>
  /** Call a tool */
  callTool(name: string, input: Record<string, unknown>): Promise<MCPToolResult>
  /** Close the server connection */
  close(): Promise<void>
}

/**
 * MCP tool info
 */
export interface MCPToolInfo {
  name: string
  description: string
  inputSchema: JSONSchema
}

/**
 * MCP tool result
 */
export interface MCPToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>
  isError?: boolean
}

/**
 * Options for creating an SDK MCP server
 */
export interface CreateMCPServerOptions {
  /** Server name (used for tool namespacing) */
  name: string
  /** Server description */
  description?: string
  /** Tools to expose */
  tools: ToolDefinition[]
}

// === Tool Event Types ===

/**
 * Tool start event
 */
export interface ToolStartEvent {
  type: "tool_start"
  toolId: string
  toolName: string
  input: Record<string, unknown>
}

/**
 * Tool progress event
 */
export interface ToolProgressEvent {
  type: "tool_progress"
  toolId: string
  progress: number
}

/**
 * Tool execution result event (internal)
 */
export interface ToolExecutionResultEvent {
  type: "tool_result"
  toolId: string
  output: ToolOutput
}

/**
 * Tool error event
 */
export interface ToolErrorEvent {
  type: "tool_error"
  toolId: string
  error: Error
}

/**
 * Union type for tool events
 */
export type ToolEvent = ToolStartEvent | ToolProgressEvent | ToolExecutionResultEvent | ToolErrorEvent
