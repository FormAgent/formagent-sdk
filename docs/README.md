# formagent-sdk Documentation

Welcome to the documentation for `formagent-sdk`, a Claude Agent SDK compatible framework for building AI agents with streaming support, tool execution, and skill management.

## Table of Contents

- [Getting Started](./getting-started.md) - Quick start guide
- [API Reference](./api-reference.md) - Complete API documentation
- [Session Storage](./session-storage.md) - Persistent session management
- [Built-in Tools](./tools.md) - File operations, bash, and more
- [MCP Servers](./mcp-servers.md) - Model Context Protocol integration

## Quick Links

### Installation

```bash
npm install formagent-sdk
# or
bun add formagent-sdk
```

### Environment Setup

```bash
export ANTHROPIC_API_KEY=your-api-key
# Optional: Custom endpoint
export ANTHROPIC_BASE_URL=https://your-proxy.com
```

### Minimal Example

```typescript
import { createSession, builtinTools } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
})

await session.send("List files in the current directory")

for await (const event of session.receive()) {
  if (event.type === "text") {
    process.stdout.write(event.text)
  }
}

await session.close()
```

## Core Concepts

### Sessions

Sessions manage conversations with Claude. They handle message history, tool execution, and streaming responses.

```typescript
const session = await createSession({ model: "claude-sonnet-4-20250514" })
await session.send("Hello!")
for await (const event of session.receive()) { /* ... */ }
await session.close()
```

### Tools

Tools extend Claude's capabilities. The SDK provides built-in tools and supports custom tool definitions.

```typescript
import { builtinTools, tool } from "formagent-sdk"
import { z } from "zod"

// Use built-in tools
const session = await createSession({ tools: builtinTools })

// Or create custom tools
const myTool = tool({
  name: "my_tool",
  description: "Does something useful",
  schema: z.object({ input: z.string() }),
  execute: async ({ input }) => `Result: ${input}`,
})
```

### MCP Servers

MCP (Model Context Protocol) servers provide a standardized way to expose tools.

```typescript
import { createSdkMcpServer, tool } from "formagent-sdk"

const server = createSdkMcpServer({
  name: "my-server",
  version: "1.0.0",
  tools: [myTool],
})
```

## Architecture

```
formagent-sdk
├── Session API          # Conversation management
│   ├── createSession()  # Create new sessions
│   ├── send()          # Send messages
│   └── receive()       # Stream responses
├── Session Storage      # Persistence layer
│   ├── MemorySessionStorage  # In-memory (default, non-persistent)
│   └── FileSessionStorage    # File-based persistence
├── Tool System          # Tool execution
│   ├── builtinTools    # Built-in tools (Bash, Read, Write, etc.)
│   ├── tool()          # Tool definition helper
│   └── ToolManager     # Tool registration and execution
├── MCP Integration      # Model Context Protocol
│   ├── createSdkMcpServer()
│   └── MCPServerManager
└── Providers            # LLM providers
    ├── AnthropicProvider
    ├── OpenAIProvider
    └── GeminiProvider
```

## Support

- [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- [Examples](../examples/)
