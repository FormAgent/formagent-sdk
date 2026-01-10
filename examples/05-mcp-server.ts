/**
 * Example 05: MCP Server
 *
 * Demonstrates MCP (Model Context Protocol) server integration:
 * - Creating MCP servers from tools
 * - MCP tool naming conventions
 * - MCPServerWrapper and MCPServerManager
 * - Integrating MCP with ToolManager
 *
 * Note: This example doesn't require an API key as it demonstrates
 * the MCP server creation and management features.
 *
 * Run: bun run examples/05-mcp-server.ts
 */

import {
  createSdkMcpServer,
  MCPServerWrapper,
  MCPServerManager,
  createMCPToolName,
  parseMCPToolName,
  isMCPTool,
  tool,
  ToolManager,
} from "../src"
import type { ToolOutput } from "../src"
import { runExample, main, printSubHeader } from "./_utils"

// Define sample tools for the MCP server
const readFileTool = tool({
  name: "read_file",
  description: "Read the contents of a file",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
    },
    required: ["path"],
  },
  execute: async (input: { path: string }): Promise<ToolOutput> => {
    // Simulated file read
    return { content: `Contents of ${input.path}:\n[Simulated file contents here]` }
  },
})

const writeFileTool = tool({
  name: "write_file",
  description: "Write contents to a file",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to write" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (input: { path: string; content: string }): Promise<ToolOutput> => {
    return { content: `Wrote ${input.content.length} bytes to ${input.path}` }
  },
})

const listDirTool = tool({
  name: "list_directory",
  description: "List files in a directory",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" },
    },
    required: ["path"],
  },
  execute: async (input: { path: string }): Promise<ToolOutput> => {
    return {
      content: `Files in ${input.path}:\n- file1.txt\n- file2.js\n- folder/`,
    }
  },
})

main(async () => {
  // Example 1: Create an MCP server from tools
  await runExample("Create MCP Server", async () => {
    const mcpServer = createSdkMcpServer({
      name: "filesystem",
      description: "File system operations",
      tools: [readFileTool, writeFileTool, listDirTool],
    })

    console.log("Created MCP server:", mcpServer.name)

    printSubHeader("Available Tools")
    const tools = await mcpServer.listTools()
    for (const t of tools) {
      console.log(`  - ${t.name}: ${t.description}`)
    }

    printSubHeader("Call Tool")
    const result = await mcpServer.callTool("read_file", { path: "/etc/hosts" })
    console.log("Result:", result.content[0])
  })

  // Example 2: MCP tool naming conventions
  await runExample("MCP Tool Naming", async () => {
    // Create namespaced tool names
    const toolName = createMCPToolName("filesystem", "read_file")
    console.log("Namespaced name:", toolName)
    // Output: mcp__filesystem__read_file

    // Parse namespaced names back
    const parsed = parseMCPToolName(toolName)
    console.log("Parsed:", parsed)
    // Output: { serverName: 'filesystem', toolName: 'read_file' }

    // Check if a name is an MCP tool
    console.log("\nIs MCP tool?")
    console.log(`  "${toolName}": ${isMCPTool(toolName)}`)
    console.log(`  "calculator": ${isMCPTool("calculator")}`)
  })

  // Example 3: MCPServerWrapper
  await runExample("MCP Server Wrapper", async () => {
    const mcpServer = createSdkMcpServer({
      name: "filesystem",
      tools: [readFileTool, writeFileTool],
    })

    const wrapper = new MCPServerWrapper(mcpServer)

    // Get tools as SDK ToolDefinitions
    const sdkTools = await wrapper.getTools()
    console.log("SDK tools from MCP server:")
    for (const t of sdkTools) {
      console.log(`  - ${t.name}`)
    }

    // Execute by original name
    printSubHeader("Execute Tool")
    const result = await wrapper.executeTool("read_file", { path: "/tmp/test.txt" })
    console.log("Result:", result.content)

    await wrapper.close()
  })

  // Example 4: MCPServerManager
  await runExample("MCP Server Manager", async () => {
    const manager = new MCPServerManager()

    // Create and register multiple servers
    const fsServer = createSdkMcpServer({
      name: "filesystem",
      tools: [readFileTool, writeFileTool, listDirTool],
    })

    const dbServer = createSdkMcpServer({
      name: "database",
      tools: [
        tool({
          name: "query",
          description: "Execute a database query",
          schema: {
            type: "object",
            properties: { sql: { type: "string" } },
            required: ["sql"],
          },
          execute: async (input: { sql: string }): Promise<ToolOutput> => {
            return { content: `Query executed: ${input.sql}` }
          },
        }),
      ],
    })

    await manager.register(fsServer)
    await manager.register(dbServer)

    console.log("Registered servers:", manager.getServers().map((s) => s.name))

    printSubHeader("All Tools Across Servers")
    const allTools = await manager.getAllTools()
    for (const t of allTools) {
      console.log(`  - ${t.name}`)
    }

    await manager.closeAll()
  })

  // Example 5: Integrate MCP with ToolManager
  await runExample("MCP + ToolManager Integration", async () => {
    const toolManager = new ToolManager()

    // Create and register MCP server
    const mcpServer = createSdkMcpServer({
      name: "filesystem",
      tools: [readFileTool, writeFileTool],
    })

    const toolCount = await toolManager.registerMCPServer(mcpServer)
    console.log(`Registered ${toolCount} tools from MCP server`)

    printSubHeader("All Available Tools")
    for (const t of toolManager.getAll()) {
      console.log(`  - ${t.name}`)
    }

    printSubHeader("Execute MCP Tool via ToolManager")
    const result = await toolManager.execute(
      "mcp__filesystem__read_file",
      { path: "/home/user/notes.txt" },
      {
        sessionId: "test-session",
        abortSignal: new AbortController().signal,
      }
    )
    console.log("Result:", result.content)
  })

  console.log("\n[All examples completed successfully!]")
})
