/**
 * MCP (Model Context Protocol) server integration
 * @module formagent-sdk/tools/mcp
 */

import type {
  MCPServer,
  MCPToolInfo,
  MCPToolResult,
  ToolDefinition,
  ToolContext,
  ToolOutput,
  CreateMCPServerOptions,
} from "../types/tool"

/**
 * MCP tool namespace separator
 */
export const MCP_NAMESPACE_SEPARATOR = "__"

/**
 * Create a namespaced tool name for MCP
 *
 * @param serverName - MCP server name
 * @param toolName - Tool name
 * @returns Namespaced tool name (mcp__{server}__{tool})
 */
export function createMCPToolName(serverName: string, toolName: string): string {
  return `mcp${MCP_NAMESPACE_SEPARATOR}${serverName}${MCP_NAMESPACE_SEPARATOR}${toolName}`
}

/**
 * Parse a namespaced MCP tool name
 *
 * @param namespacedName - Namespaced tool name
 * @returns Server and tool names, or null if not an MCP tool
 */
export function parseMCPToolName(namespacedName: string): { serverName: string; toolName: string } | null {
  const parts = namespacedName.split(MCP_NAMESPACE_SEPARATOR)
  if (parts.length < 3 || parts[0] !== "mcp") {
    return null
  }
  return {
    serverName: parts[1],
    toolName: parts.slice(2).join(MCP_NAMESPACE_SEPARATOR),
  }
}

/**
 * Check if a tool name is an MCP tool
 *
 * @param name - Tool name to check
 * @returns True if this is an MCP tool name
 */
export function isMCPTool(name: string): boolean {
  return name.startsWith(`mcp${MCP_NAMESPACE_SEPARATOR}`)
}

/**
 * MCP server wrapper that integrates with the tool system
 *
 * Wraps an MCP server to provide tool definitions that can be
 * registered with the ToolRegistry.
 *
 * @example
 * ```ts
 * const mcpServer = await client.connectToServer("filesystem")
 * const wrapper = new MCPServerWrapper(mcpServer)
 *
 * // Get tools for registration
 * const tools = await wrapper.getTools()
 * for (const tool of tools) {
 *   registry.register(tool)
 * }
 * ```
 */
export class MCPServerWrapper {
  private server: MCPServer
  private toolCache: Map<string, MCPToolInfo> = new Map()

  constructor(server: MCPServer) {
    this.server = server
  }

  /**
   * Get the server name
   */
  get name(): string {
    return this.server.name
  }

  /**
   * Get all tools from the MCP server as ToolDefinitions
   *
   * @returns Array of tool definitions
   */
  async getTools(): Promise<ToolDefinition[]> {
    const mcpTools = await this.server.listTools()
    const tools: ToolDefinition[] = []

    for (const mcpTool of mcpTools) {
      this.toolCache.set(mcpTool.name, mcpTool)

      const namespacedName = createMCPToolName(this.server.name, mcpTool.name)

      tools.push({
        name: namespacedName,
        description: `[MCP: ${this.server.name}] ${mcpTool.description}`,
        inputSchema: mcpTool.inputSchema,
        execute: async (input: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
          return this.executeTool(mcpTool.name, input)
        },
      })
    }

    return tools
  }

  /**
   * Execute an MCP tool by its original name
   *
   * @param toolName - Original tool name (not namespaced)
   * @param input - Tool input
   * @returns Tool output
   */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolOutput> {
    const result = await this.server.callTool(toolName, input)
    return this.convertResult(result)
  }

  /**
   * Execute an MCP tool by its namespaced name
   *
   * @param namespacedName - Namespaced tool name
   * @param input - Tool input
   * @returns Tool output
   */
  async executeNamespacedTool(namespacedName: string, input: Record<string, unknown>): Promise<ToolOutput> {
    const parsed = parseMCPToolName(namespacedName)
    if (!parsed || parsed.serverName !== this.server.name) {
      throw new Error(`Tool ${namespacedName} is not from server ${this.server.name}`)
    }
    return this.executeTool(parsed.toolName, input)
  }

  /**
   * Close the MCP server connection
   */
  async close(): Promise<void> {
    await this.server.close()
    this.toolCache.clear()
  }

  /**
   * Convert MCP result to ToolOutput
   */
  private convertResult(result: MCPToolResult): ToolOutput {
    // Convert MCP content to our format
    const content = result.content.map((item) => {
      if (item.type === "text") {
        return item.text
      }
      if (item.type === "image") {
        return `[Image: ${item.mimeType}]`
      }
      return ""
    }).join("\n")

    return {
      content,
      isError: result.isError,
    }
  }
}

/**
 * Create SDK MCP server from tool definitions
 *
 * Creates an MCP server that exposes the given tools.
 *
 * @param options - Server options
 * @returns MCPServer instance
 *
 * @example
 * ```ts
 * const server = createSdkMcpServer({
 *   name: "my-tools",
 *   tools: [readFileTool, writeFileTool],
 * })
 *
 * // Use server in MCP protocol
 * await server.listTools() // Returns tool info
 * await server.callTool("read_file", { path: "/etc/passwd" })
 * ```
 */
export function createSdkMcpServer(options: CreateMCPServerOptions): MCPServer {
  const toolMap = new Map<string, ToolDefinition>()

  for (const tool of options.tools) {
    toolMap.set(tool.name, tool)
  }

  return {
    name: options.name,

    async listTools(): Promise<MCPToolInfo[]> {
      return options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }))
    },

    async callTool(name: string, input: Record<string, unknown>): Promise<MCPToolResult> {
      const tool = toolMap.get(name)
      if (!tool) {
        return {
          content: [{ type: "text", text: `Tool not found: ${name}` }],
          isError: true,
        }
      }

      try {
        // Create a minimal context for execution
        const context: ToolContext = {
          sessionId: "mcp-session",
          abortSignal: new AbortController().signal,
        }

        const result = await tool.execute(input, context)

        // Convert ToolOutput to MCPToolResult
        if (typeof result.content === "string") {
          return {
            content: [{ type: "text", text: result.content }],
            isError: result.isError,
          }
        }

        // Convert content blocks
        const content: MCPToolResult["content"] = []
        for (const block of result.content) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text })
          } else if (block.type === "image" && block.source.type === "base64") {
            content.push({
              type: "image",
              data: block.source.data!,
              mimeType: block.source.media_type || "image/png",
            })
          }
        }

        return {
          content: content.length > 0 ? content : [{ type: "text", text: "" }],
          isError: result.isError,
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },

    async close(): Promise<void> {
      // Nothing to clean up for SDK server
    },
  }
}

/**
 * MCP server manager for handling multiple servers
 */
export class MCPServerManager {
  private servers: Map<string, MCPServerWrapper> = new Map()

  /**
   * Register an MCP server
   *
   * @param server - MCP server to register
   * @returns MCPServerWrapper for the server
   */
  async register(server: MCPServer): Promise<MCPServerWrapper> {
    const wrapper = new MCPServerWrapper(server)
    this.servers.set(server.name, wrapper)
    return wrapper
  }

  /**
   * Unregister an MCP server
   *
   * @param serverName - Server name to unregister
   */
  async unregister(serverName: string): Promise<void> {
    const wrapper = this.servers.get(serverName)
    if (wrapper) {
      await wrapper.close()
      this.servers.delete(serverName)
    }
  }

  /**
   * Get all registered servers
   */
  getServers(): MCPServerWrapper[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get a server by name
   */
  getServer(name: string): MCPServerWrapper | undefined {
    return this.servers.get(name)
  }

  /**
   * Get all tools from all registered servers
   */
  async getAllTools(): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = []

    for (const wrapper of this.servers.values()) {
      const tools = await wrapper.getTools()
      allTools.push(...tools)
    }

    return allTools
  }

  /**
   * Close all servers
   */
  async closeAll(): Promise<void> {
    for (const wrapper of this.servers.values()) {
      await wrapper.close()
    }
    this.servers.clear()
  }
}

/**
 * Default MCP server manager instance
 */
export const defaultMCPServerManager = new MCPServerManager()
