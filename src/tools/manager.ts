/**
 * ToolManager implementation for managing tools and MCP servers
 * @module formagent-sdk/tools/manager
 */

import type {
  ToolDefinition,
  ToolContext,
  ToolOutput,
  ToolRegistry,
  MCPServer,
  ToolEvent,
} from "../types/tool"
import { MCPServerWrapper, isMCPTool, parseMCPToolName } from "./mcp"
import { generateId } from "../utils/id"

/**
 * Tool filter function type
 */
export type ToolFilter = (tool: ToolDefinition) => boolean

/**
 * Allowed tools specification
 * - string[]: List of allowed tool names (supports wildcards with *)
 * - ToolFilter: Custom filter function
 * - undefined: Allow all tools
 */
export type AllowedToolsSpec = string[] | ToolFilter | undefined

/**
 * Tool repair result
 */
export interface ToolRepairResult {
  /** Whether the tool was repaired */
  repaired: boolean
  /** Original tool name */
  originalName: string
  /** Repaired tool name (if repaired) */
  repairedName?: string
  /** Error message (if repair failed) */
  error?: string
}

/**
 * ToolManager options
 */
export interface ToolManagerOptions {
  /** Allowed tools specification */
  allowedTools?: AllowedToolsSpec
  /** Event handler for tool events */
  onToolEvent?: (event: ToolEvent) => void
  /** Enable tool name repair (case-insensitive matching) */
  enableToolRepair?: boolean
}

/**
 * ToolManager implementation
 *
 * Manages tool registration, MCP server integration, and tool execution
 * with support for tool filtering and event handling.
 *
 * @example
 * ```ts
 * const manager = new ToolManager()
 *
 * // Register tools
 * manager.register(readFileTool)
 * manager.register(writeFileTool)
 *
 * // Register MCP server
 * await manager.registerMCPServer(mcpServer)
 *
 * // Execute tool
 * const result = await manager.execute("read_file", { path: "/etc/hosts" }, context)
 * ```
 */
export class ToolManager implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()
  private toolNameLookup: Map<string, string> = new Map() // lowercase -> original name
  private mcpServers: Map<string, MCPServerWrapper> = new Map()
  private allowedTools: AllowedToolsSpec
  private onToolEvent?: (event: ToolEvent) => void
  private enableToolRepair: boolean

  constructor(options: ToolManagerOptions = {}) {
    this.allowedTools = options.allowedTools
    this.onToolEvent = options.onToolEvent
    this.enableToolRepair = options.enableToolRepair ?? true // Enabled by default
  }

  /**
   * Register a tool
   *
   * @param tool - Tool definition to register
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
    // Add lowercase lookup for case-insensitive matching
    this.toolNameLookup.set(tool.name.toLowerCase(), tool.name)
  }

  /**
   * Unregister a tool by name
   *
   * @param name - Tool name to unregister
   */
  unregister(name: string): void {
    this.tools.delete(name)
    this.toolNameLookup.delete(name.toLowerCase())
  }

  /**
   * Get a tool by name
   *
   * @param name - Tool name
   * @returns Tool definition or undefined
   */
  get(name: string): ToolDefinition | undefined {
    // Check local tools first (exact match)
    const tool = this.tools.get(name)
    if (tool) {
      return tool
    }

    // Try case-insensitive match if repair is enabled
    if (this.enableToolRepair) {
      const lowerName = name.toLowerCase()
      const originalName = this.toolNameLookup.get(lowerName)
      if (originalName) {
        return this.tools.get(originalName)
      }
    }

    // Check MCP tools
    if (isMCPTool(name)) {
      const parsed = parseMCPToolName(name)
      if (parsed) {
        const wrapper = this.mcpServers.get(parsed.serverName)
        if (wrapper) {
          // Return a proxy tool definition for the MCP tool
          return this.createMCPToolProxy(name, wrapper)
        }
      }
    }

    return undefined
  }

  /**
   * Attempt to repair a tool name
   *
   * Tries case-insensitive matching to find the correct tool name.
   *
   * @param name - Original tool name
   * @returns Repair result with corrected name or error
   */
  repairToolName(name: string): ToolRepairResult {
    // Check exact match first
    if (this.tools.has(name)) {
      return { repaired: false, originalName: name }
    }

    // Try case-insensitive match
    const lowerName = name.toLowerCase()
    const originalName = this.toolNameLookup.get(lowerName)

    if (originalName && originalName !== name) {
      return {
        repaired: true,
        originalName: name,
        repairedName: originalName,
      }
    }

    // Check MCP tools
    if (isMCPTool(name)) {
      const parsed = parseMCPToolName(name)
      if (parsed) {
        const wrapper = this.mcpServers.get(parsed.serverName)
        if (wrapper) {
          return { repaired: false, originalName: name }
        }
      }
    }

    // Tool not found
    return {
      repaired: false,
      originalName: name,
      error: `Tool "${name}" not found. Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
    }
  }

  /**
   * Get all registered tools (respecting allowed tools filter)
   *
   * @returns Array of tool definitions
   */
  getAll(): ToolDefinition[] {
    const allTools: ToolDefinition[] = []

    // Add local tools
    for (const tool of this.tools.values()) {
      if (this.isToolAllowed(tool)) {
        allTools.push(tool)
      }
    }

    // Add MCP tools
    for (const wrapper of this.mcpServers.values()) {
      // MCP tools are already cached when registered
      const mcpTools = Array.from(this.tools.values()).filter((t) =>
        isMCPTool(t.name) && t.name.includes(`__${wrapper.name}__`)
      )
      // Already included in this.tools, no need to add again
    }

    return allTools
  }

  /**
   * Check if a tool is registered
   *
   * @param name - Tool name
   * @returns True if tool exists
   */
  has(name: string): boolean {
    return this.get(name) !== undefined
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear()
    this.toolNameLookup.clear()
  }

  /**
   * Register an MCP server
   *
   * Discovers all tools from the server and registers them with
   * the mcp__{server}__{tool} naming convention.
   *
   * @param server - MCP server to register
   * @returns Number of tools registered
   */
  async registerMCPServer(server: MCPServer): Promise<number> {
    const wrapper = new MCPServerWrapper(server)
    this.mcpServers.set(server.name, wrapper)

    // Get and register all tools from the server
    const tools = await wrapper.getTools()
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
      this.toolNameLookup.set(tool.name.toLowerCase(), tool.name)
    }

    return tools.length
  }

  /**
   * Unregister an MCP server
   *
   * @param serverName - Server name to unregister
   */
  async unregisterMCPServer(serverName: string): Promise<void> {
    const wrapper = this.mcpServers.get(serverName)
    if (wrapper) {
      // Remove all tools from this server
      for (const [name, _tool] of this.tools) {
        if (isMCPTool(name)) {
          const parsed = parseMCPToolName(name)
          if (parsed?.serverName === serverName) {
            this.tools.delete(name)
            this.toolNameLookup.delete(name.toLowerCase())
          }
        }
      }

      await wrapper.close()
      this.mcpServers.delete(serverName)
    }
  }

  /**
   * Get all registered MCP servers
   *
   * @returns Array of server names
   */
  getMCPServers(): string[] {
    return Array.from(this.mcpServers.keys())
  }

  /**
   * Execute a tool by name
   *
   * Supports automatic tool name repair (case-insensitive matching) when enabled.
   *
   * @param name - Tool name
   * @param input - Tool input parameters
   * @param context - Tool execution context
   * @returns Tool output
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolOutput> {
    // Try to repair tool name if exact match not found
    let effectiveName = name
    let tool = this.tools.get(name)

    if (!tool && this.enableToolRepair) {
      const repairResult = this.repairToolName(name)
      if (repairResult.repaired && repairResult.repairedName) {
        effectiveName = repairResult.repairedName
        tool = this.tools.get(effectiveName)
        // Log the repair for debugging
        console.debug(`[ToolManager] Repaired tool name: "${name}" -> "${effectiveName}"`)
      }
    }

    // If still not found, try the full get() which handles MCP tools
    if (!tool) {
      tool = this.get(name)
    }

    if (!tool) {
      // Return helpful error message with available tools
      const availableTools = Array.from(this.tools.keys()).slice(0, 10)
      const suffix = this.tools.size > 10 ? ` (and ${this.tools.size - 10} more)` : ""
      throw new Error(
        `Tool not found: "${name}". Available tools: ${availableTools.join(", ")}${suffix}`
      )
    }

    if (!this.isToolAllowed(tool)) {
      throw new Error(`Tool not allowed: ${name}`)
    }

    const toolId = generateId("tool")

    // Emit start event (use effective name to show repaired name)
    this.emitEvent({
      type: "tool_start",
      toolId,
      toolName: effectiveName,
      input,
    })

    try {
      const result = await tool.execute(input, context)

      // Emit result event
      this.emitEvent({
        type: "tool_result",
        toolId,
        output: result,
      })

      return result
    } catch (error) {
      // Emit error event
      this.emitEvent({
        type: "tool_error",
        toolId,
        error: error instanceof Error ? error : new Error(String(error)),
      })

      throw error
    }
  }

  /**
   * Set allowed tools filter
   *
   * @param allowedTools - Allowed tools specification
   */
  setAllowedTools(allowedTools: AllowedToolsSpec): void {
    this.allowedTools = allowedTools
  }

  /**
   * Get filtered tools based on allowed tools specification
   *
   * @returns Filtered array of tool definitions
   */
  getFilteredTools(): ToolDefinition[] {
    return this.getAll().filter((tool) => this.isToolAllowed(tool))
  }

  /**
   * Check if a tool is allowed
   */
  private isToolAllowed(tool: ToolDefinition): boolean {
    if (!this.allowedTools) {
      return true
    }

    if (typeof this.allowedTools === "function") {
      return this.allowedTools(tool)
    }

    // Array of patterns
    for (const pattern of this.allowedTools) {
      if (this.matchesPattern(tool.name, pattern)) {
        return true
      }
    }

    return false
  }

  /**
   * Check if a tool name matches a pattern
   * Supports wildcards with *
   */
  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern === "*") {
      return true
    }

    if (pattern.includes("*")) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
      return new RegExp(`^${regexPattern}$`).test(name)
    }

    return name === pattern
  }

  /**
   * Create a proxy tool definition for an MCP tool
   */
  private createMCPToolProxy(name: string, wrapper: MCPServerWrapper): ToolDefinition | undefined {
    // This is a fallback - tools should be pre-registered
    // But we can create a proxy for dynamic discovery
    const parsed = parseMCPToolName(name)
    if (!parsed) {
      return undefined
    }

    return {
      name,
      description: `MCP tool: ${parsed.toolName} from ${parsed.serverName}`,
      inputSchema: { type: "object", properties: {} },
      execute: async (input: Record<string, unknown>, _context: ToolContext) => {
        return wrapper.executeNamespacedTool(name, input)
      },
    }
  }

  /**
   * Emit a tool event
   */
  private emitEvent(event: ToolEvent): void {
    this.onToolEvent?.(event)
  }
}

/**
 * Create a new ToolManager
 *
 * @param options - Manager options
 * @returns ToolManager instance
 */
export function createToolManager(options?: ToolManagerOptions): ToolManager {
  return new ToolManager(options)
}

/**
 * Default global tool manager
 */
export const defaultToolManager = new ToolManager()
