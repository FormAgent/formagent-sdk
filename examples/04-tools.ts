/**
 * Example 04: Custom Tools
 *
 * Demonstrates how to define and use tools with the SDK:
 * - Defining tools with schemas
 * - Using tools in sessions
 * - ToolManager for direct execution
 * - Tool filtering
 *
 * Run: bun run examples/04-tools.ts
 */

import { createSession, tool, ToolManager } from "../src"
import type { ToolOutput } from "../src"
import { setupAnthropic, runExample, processStream, main } from "./_utils"

// Define a calculator tool
const calculatorTool = tool({
  name: "calculator",
  description: "Perform basic arithmetic operations (add, subtract, multiply, divide)",
  schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The arithmetic operation to perform",
      },
      a: { type: "number", description: "First number" },
      b: { type: "number", description: "Second number" },
    },
    required: ["operation", "a", "b"],
  },
  execute: async (input: { operation: string; a: number; b: number }): Promise<ToolOutput> => {
    const { operation, a, b } = input
    let result: number

    switch (operation) {
      case "add":
        result = a + b
        break
      case "subtract":
        result = a - b
        break
      case "multiply":
        result = a * b
        break
      case "divide":
        if (b === 0) {
          return { content: "Error: Division by zero", isError: true }
        }
        result = a / b
        break
      default:
        return { content: `Unknown operation: ${operation}`, isError: true }
    }

    return { content: `${a} ${operation} ${b} = ${result}` }
  },
})

// Define a weather tool (simulated)
const weatherTool = tool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit",
        default: "celsius",
      },
    },
    required: ["city"],
  },
  execute: async (input: { city: string; unit?: string }): Promise<ToolOutput> => {
    // Simulated weather data
    const temp = Math.floor(Math.random() * 25) + 5
    const conditions = ["sunny", "cloudy", "rainy", "windy"][Math.floor(Math.random() * 4)]
    const unit = input.unit === "fahrenheit" ? "°F" : "°C"
    const displayTemp = input.unit === "fahrenheit" ? Math.round(temp * 1.8 + 32) : temp

    return {
      content: JSON.stringify({
        city: input.city,
        temperature: displayTemp,
        unit: unit,
        conditions: conditions,
      }),
    }
  },
})

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Session with tools
  await runExample("Session with Tools", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: [calculatorTool, weatherTool],
    })

    await session.send("What's 25 multiplied by 4? Use the calculator tool.")
    await processStream(session.receive())
  })

  // Example 2: Weather tool usage
  await runExample("Weather Tool", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: [weatherTool],
    })

    await session.send("What's the weather in Tokyo? Use the get_weather tool.")
    await processStream(session.receive())
  })

  // Example 3: Using ToolManager directly
  await runExample("ToolManager Direct Execution", async () => {
    const manager = new ToolManager()

    // Register tools
    manager.register(calculatorTool)
    manager.register(weatherTool)

    // List registered tools
    console.log("Registered tools:")
    for (const t of manager.getAll()) {
      console.log(`  - ${t.name}: ${t.description}`)
    }

    // Execute tool directly
    const result = await manager.execute(
      "calculator",
      { operation: "multiply", a: 7, b: 8 },
      {
        sessionId: "test-session",
        abortSignal: new AbortController().signal,
      }
    )

    console.log("\nDirect execution result:", result.content)
  })

  // Example 4: Tool filtering
  await runExample("Tool Filtering", async () => {
    // Only allow specific tools
    const manager = new ToolManager({
      allowedTools: ["calculator"],
    })

    manager.register(calculatorTool)
    manager.register(weatherTool)

    console.log("All registered tools:")
    for (const t of manager.getAll()) {
      console.log(`  - ${t.name}`)
    }

    console.log("\nFiltered tools (only calculator):")
    for (const t of manager.getFilteredTools()) {
      console.log(`  - ${t.name}`)
    }
  })

  // Example 5: Wildcard filtering
  await runExample("Wildcard Tool Filtering", async () => {
    const manager = new ToolManager({
      allowedTools: ["get_*"], // Allow all tools starting with "get_"
    })

    manager.register(calculatorTool)
    manager.register(weatherTool)

    console.log("Filtered tools (get_* pattern):")
    for (const t of manager.getFilteredTools()) {
      console.log(`  - ${t.name}`)
    }
  })

  // Example 6: Multiple tool calls
  await runExample("Multiple Tool Calls", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: [calculatorTool],
    })

    await session.send(
      "Calculate these: 10 + 5, then 100 / 4. Use the calculator for each."
    )
    await processStream(session.receive())
  })

  console.log("\n[All examples completed successfully!]")
})
