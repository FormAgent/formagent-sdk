/**
 * Example 12: Built-in Tools
 *
 * Demonstrates the built-in tools that provide Claude Agent SDK compatible functionality:
 * - All built-in tools overview
 * - File tools collection
 * - Individual tool usage
 * - Custom tool configuration
 * - Todo management
 *
 * Run: bun run examples/12-builtin-tools.ts
 */

import {
  createSession,
  builtinTools,
  fileTools,
  createBuiltinTools,
  createFileTools,
  // Individual tools
  ReadTool,
  GlobTool,
  GrepTool,
  TodoWriteTool,
  // Tool factories
  createBashTool,
  createReadTool,
  // Todo utilities
  getTodos,
  clearTodos,
  setTodoChangeCallback,
  // Manager
  ToolManager,
} from "../src"
import { setupAnthropic, runExample, processStream, main, printSubHeader } from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: All built-in tools overview
  await runExample("All Built-in Tools", async () => {
    console.log("Available built-in tools:\n")
    for (const tool of builtinTools) {
      const desc = tool.description?.slice(0, 50) || ""
      console.log(`  ${tool.name.padEnd(12)} ${desc}...`)
    }
    console.log(`\nTotal: ${builtinTools.length} tools`)
  })

  // Example 2: File tools collection
  await runExample("File Tools Collection", async () => {
    console.log("File operation tools:")
    for (const tool of fileTools) {
      console.log(`  - ${tool.name}`)
    }
    console.log(`\nTotal: ${fileTools.length} file tools`)
  })

  // Example 3: Custom configured tools
  await runExample("Custom Tool Configuration", async () => {
    // Create tools with custom options
    const customTools = createBuiltinTools({
      cwd: process.cwd(),
      defaultTimeout: 60000,
    })

    console.log("Custom configured tools:")
    for (const tool of customTools) {
      console.log(`  - ${tool.name}`)
    }

    // Or create just file tools with custom options
    printSubHeader("Custom File Tools")
    const customFileTools = createFileTools({
      cwd: "/tmp",
    })
    console.log(`Created ${customFileTools.length} file tools with cwd=/tmp`)
  })

  // Example 4: Individual tool usage via ToolManager
  await runExample("Individual Tool Usage", async () => {
    const manager = new ToolManager()

    // Register only specific tools
    manager.register(ReadTool)
    manager.register(GlobTool)
    manager.register(GrepTool)

    console.log("Registered tools:")
    for (const t of manager.getAll()) {
      console.log(`  - ${t.name}`)
    }

    // Execute Glob directly
    printSubHeader("Execute Glob Tool")
    const globResult = await manager.execute(
      "Glob",
      { pattern: "*.ts", path: process.cwd() + "/src" },
      {
        sessionId: "test",
        abortSignal: new AbortController().signal,
      }
    )
    const files = globResult.content?.split("\n").slice(0, 5) || []
    console.log("First 5 .ts files:")
    for (const file of files) {
      if (file.trim()) console.log(`  ${file}`)
    }
  })

  // Example 5: Todo management
  await runExample("Todo Management", async () => {
    // Clear any existing todos
    clearTodos()

    // Set up a callback for todo changes
    setTodoChangeCallback((todos) => {
      console.log(`[Callback] ${todos.length} items updated`)
    })

    const manager = new ToolManager()
    manager.register(TodoWriteTool)

    // Add some todos
    await manager.execute(
      "TodoWrite",
      {
        todos: [
          { content: "Read the file", status: "completed", activeForm: "Reading the file" },
          { content: "Analyze the code", status: "in_progress", activeForm: "Analyzing the code" },
          { content: "Write the report", status: "pending", activeForm: "Writing the report" },
        ],
      },
      {
        sessionId: "test",
        abortSignal: new AbortController().signal,
      }
    )

    // Get current todos
    printSubHeader("Current Todos")
    const todos = getTodos()
    for (const todo of todos) {
      const icon =
        todo.status === "completed" ? "[x]" :
        todo.status === "in_progress" ? "[>]" : "[ ]"
      console.log(`  ${icon} ${todo.content}`)
    }

    // Clean up
    setTodoChangeCallback(null)
    clearTodos()
  })

  // Example 6: Session with built-in tools
  await runExample("Session with Built-in Tools", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      systemPrompt: "You are a helpful assistant. Use tools to help the user. Be concise.",
    })

    await session.send("Use the Glob tool to find .json files in the current directory. List max 3 files.")
    await processStream(session.receive())
  })

  // Example 7: Custom Bash tool with timeout
  await runExample("Custom Bash Tool", async () => {
    const quickBash = createBashTool({
      defaultTimeout: 5000, // 5 second timeout
      cwd: process.cwd(),
    })

    const manager = new ToolManager()
    manager.register(quickBash)

    const result = await manager.execute(
      "Bash",
      { command: "echo 'Hello from custom bash!'", description: "Test echo" },
      {
        sessionId: "test",
        abortSignal: new AbortController().signal,
      }
    )
    console.log("Result:", result.content?.trim())
  })

  // Example 8: Read tool with line limits
  await runExample("Read Tool with Limits", async () => {
    const limitedRead = createReadTool({
      cwd: process.cwd(),
    })

    const manager = new ToolManager()
    manager.register(limitedRead)

    const result = await manager.execute(
      "Read",
      {
        file_path: process.cwd() + "/package.json",
        limit: 5, // Only first 5 lines
      },
      {
        sessionId: "test",
        abortSignal: new AbortController().signal,
      }
    )
    console.log("First 5 lines of package.json:")
    console.log(result.content)
  })

  console.log("\n[All examples completed successfully!]")
})
