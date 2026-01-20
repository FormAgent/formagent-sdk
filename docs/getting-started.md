# Getting Started

This guide will help you get up and running with `formagent-sdk` in minutes.

## Installation

```bash
# Using npm
npm install formagent-sdk

# Using bun
bun add formagent-sdk

# Using yarn
yarn add formagent-sdk
```

## Environment Setup

The SDK automatically reads API keys from environment variables:

```bash
# Required: Anthropic API key
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional: Custom API endpoint
export ANTHROPIC_BASE_URL=https://your-proxy.com

# Optional: For OpenAI models
export OPENAI_API_KEY=your-openai-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1
```

## Your First Session

### Basic Conversation

```typescript
import { createSession } from "formagent-sdk"

async function main() {
  // Create a session (API key from env)
  const session = await createSession({
    model: "claude-sonnet-4-20250514",
  })

  // Send a message
  await session.send("What is the capital of France?")

  // Receive streaming response
  for await (const event of session.receive()) {
    if (event.type === "text") {
      process.stdout.write(event.text)
    }
  }

  console.log() // newline
  await session.close()
}

main()
```

### One-Shot Prompts

For simple single-turn interactions:

```typescript
import { prompt } from "formagent-sdk"

const response = await prompt("What is 2 + 2?")
console.log(response) // "4"

// With full result including usage
const result = await prompt("Hello!", { textOnly: false })
console.log(result.text)
console.log(result.usage) // { input_tokens: 10, output_tokens: 5 }
```

## Adding Tools

Tools allow Claude to interact with the outside world.

### Using Built-in Tools

```typescript
import { createSession, builtinTools } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools, // Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite
})

await session.send("List all TypeScript files in the src directory")

for await (const event of session.receive()) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text)
      break
    case "tool_use":
      console.log(`\n[Using tool: ${event.name}]`)
      break
    case "tool_result":
      console.log(`[Result: ${event.content?.slice(0, 100)}...]`)
      break
  }
}

await session.close()
```

### Creating Custom Tools

```typescript
import { createSession, tool } from "formagent-sdk"
import { z } from "zod"

// Define a custom tool
const weatherTool = tool({
  name: "get_weather",
  description: "Get the current weather for a location",
  schema: z.object({
    location: z.string().describe("City name"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ location, unit = "celsius" }) => {
    // Your weather API call here
    return `Weather in ${location}: 22°${unit === "celsius" ? "C" : "F"}, sunny`
  },
})

// Or use Claude SDK style (positional arguments)
const calculatorTool = tool(
  "calculate",
  "Perform a math calculation",
  { expression: z.string().describe("Math expression") },
  async ({ expression }) => `Result: ${eval(expression)}`
)

// Use in session
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: [weatherTool, calculatorTool],
})
```

## Multi-Turn Conversations

Sessions automatically maintain conversation history:

```typescript
import { createSession } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  systemPrompt: "You are a helpful coding assistant.",
})

// First turn
await session.send("What is a closure in JavaScript?")
for await (const event of session.receive()) {
  if (event.type === "text") process.stdout.write(event.text)
}

// Second turn (has context from first)
await session.send("Can you show me an example?")
for await (const event of session.receive()) {
  if (event.type === "text") process.stdout.write(event.text)
}

await session.close()
```

## Handling Events

The `receive()` method yields different event types:

```typescript
for await (const event of session.receive()) {
  switch (event.type) {
    case "text":
      // Text content from Claude
      console.log("Text:", event.text)
      break

    case "tool_use":
      // Claude wants to use a tool
      console.log("Tool:", event.name, event.input)
      break

    case "tool_result":
      // Result from tool execution
      console.log("Result:", event.content)
      break

    case "message":
      // Complete message object
      console.log("Message:", event.message)
      break

    case "stop":
      // Generation complete
      console.log("Stop reason:", event.stop_reason)
      console.log("Usage:", event.usage)
      break

    case "error":
      // Error occurred
      console.error("Error:", event.error)
      break
  }
}
```

## System Prompts

Customize Claude's behavior with system prompts:

```typescript
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  systemPrompt: `You are a senior software engineer.
Always provide code examples in TypeScript.
Be concise and focus on best practices.`,
})
```

## Session Persistence

By default, sessions are stored in memory and lost when the process exits. Use `FileSessionStorage` for persistence:

```typescript
import { createSession, FileSessionStorage, builtinTools } from "formagent-sdk"

// Create persistent storage
const storage = new FileSessionStorage("./sessions")

// Create session with persistence
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  sessionStorage: storage,
})

// Save session ID for later
console.log(`Session ID: ${session.id}`)

// ... use the session ...

await session.close()
```

### Resume a Session

```typescript
// Later, resume the session
const session = await createSession({
  sessionStorage: storage,
  resume: "previous-session-id",
})

await session.send("Continue where we left off")
```

See [Session Storage](./session-storage.md) for more details.

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
- [Session Storage](./session-storage.md) - Persistent session management
- [Built-in Tools](./tools.md) - Detailed tool documentation
- [MCP Servers](./mcp-servers.md) - Creating MCP servers
