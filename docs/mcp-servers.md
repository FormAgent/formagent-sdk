# MCP Servers

Guide to creating and using Model Context Protocol (MCP) servers with `formagent-sdk`.

## Table of Contents

- [Overview](#overview)
- [Creating an MCP Server](#creating-an-mcp-server)
- [Tool Definitions](#tool-definitions)
- [Server Management](#server-management)
- [Using MCP Tools in Sessions](#using-mcp-tools-in-sessions)
- [Advanced Patterns](#advanced-patterns)

---

## Overview

MCP (Model Context Protocol) provides a standardized way to expose tools to language models. The SDK supports creating MCP servers from tool definitions and managing multiple servers.

### Key Concepts

- **MCP Server**: A service that exposes tools via the Model Context Protocol
- **Tool Namespacing**: MCP tools are prefixed with server name (`mcp__{server}__{tool}`)
- **Server Manager**: Coordinates multiple MCP servers and aggregates their tools

---

## Creating an MCP Server

### Basic Server

```typescript
import { createSdkMcpServer, tool } from "formagent-sdk"
import { z } from "zod"

// Define tools
const weatherTool = tool({
  name: "get_weather",
  description: "Get weather for a location",
  schema: z.object({
    location: z.string().describe("City name"),
  }),
  execute: async ({ location }) => {
    return `Weather in ${location}: Sunny, 22°C`
  },
})

const forecastTool = tool({
  name: "get_forecast",
  description: "Get 5-day weather forecast",
  schema: z.object({
    location: z.string().describe("City name"),
    days: z.number().optional().describe("Number of days (1-5)"),
  }),
  execute: async ({ location, days = 5 }) => {
    return `${days}-day forecast for ${location}: Sunny → Cloudy → Rain`
  },
})

// Create MCP server
const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [weatherTool, forecastTool],
})
```

### Server Configuration

```typescript
const server = createSdkMcpServer({
  name: "my-server",           // Required: Server identifier
  version: "1.0.0",            // Required: Semantic version
  tools: [tool1, tool2],       // Required: Array of tools
})
```

---

## Tool Definitions

### Using Zod Schemas

```typescript
import { tool } from "formagent-sdk"
import { z } from "zod"

const searchTool = tool({
  name: "search",
  description: "Search the database",
  schema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().min(1).max(100).optional().describe("Max results"),
    filters: z.object({
      category: z.enum(["all", "docs", "code"]).optional(),
      dateFrom: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ query, limit = 10, filters }) => {
    const results = await performSearch(query, { limit, ...filters })
    return JSON.stringify(results)
  },
})
```

### Using JSON Schema

```typescript
import { tool } from "formagent-sdk"

const emailTool = tool({
  name: "send_email",
  description: "Send an email",
  schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email" },
      subject: { type: "string", description: "Email subject" },
      body: { type: "string", description: "Email body" },
    },
    required: ["to", "subject", "body"],
  },
  execute: async ({ to, subject, body }) => {
    await sendEmail({ to, subject, body })
    return `Email sent to ${to}`
  },
})
```

### Async Tool Execution

```typescript
const apiTool = tool({
  name: "fetch_data",
  description: "Fetch data from external API",
  schema: z.object({
    endpoint: z.string().describe("API endpoint"),
  }),
  execute: async ({ endpoint }, context) => {
    // Support cancellation
    const response = await fetch(`https://api.example.com/${endpoint}`, {
      signal: context.abortSignal,
    })

    if (!response.ok) {
      return {
        content: `API error: ${response.status}`,
        isError: true,
      }
    }

    const data = await response.json()
    return JSON.stringify(data, null, 2)
  },
})
```

---

## Server Management

### MCPServerManager

Manage multiple MCP servers and aggregate their tools.

```typescript
import { MCPServerManager, createSdkMcpServer } from "formagent-sdk"

// Create servers
const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [weatherTool],
})

const calculatorServer = createSdkMcpServer({
  name: "calculator",
  version: "1.0.0",
  tools: [addTool, subtractTool, multiplyTool],
})

// Create manager and add servers
const manager = new MCPServerManager()
manager.addServer("weather", weatherServer)
manager.addServer("calculator", calculatorServer)

// Get all tools from all servers
const allTools = manager.getAllTools()
// Tools: mcp__weather__get_weather, mcp__calculator__add, etc.
```

### Tool Namespacing

MCP tools are automatically namespaced with the pattern:

```
mcp__{serverName}__{toolName}
```

Examples:
- `weather` server with `get_weather` tool → `mcp__weather__get_weather`
- `calculator` server with `add` tool → `mcp__calculator__add`

---

## Using MCP Tools in Sessions

### With All MCP Tools

```typescript
import { createSession, MCPServerManager } from "formagent-sdk"

const manager = new MCPServerManager()
manager.addServer("weather", weatherServer)
manager.addServer("calculator", calculatorServer)

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: manager.getAllTools(),
})

await session.send("What's the weather in Tokyo and what's 15 + 27?")

for await (const event of session.receive()) {
  if (event.type === "tool_use") {
    console.log(`Using: ${event.name}`) // mcp__weather__get_weather or mcp__calculator__add
  }
}
```

### Filtering Tools

Use `allowedTools` to restrict which tools are available:

```typescript
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: manager.getAllTools(),
  allowedTools: ["mcp__weather__*"], // Only weather tools
})
```

### Combining with Built-in Tools

```typescript
import { createSession, builtinTools, MCPServerManager } from "formagent-sdk"

const manager = new MCPServerManager()
manager.addServer("custom", customServer)

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: [
    ...builtinTools,           // File operations, bash, etc.
    ...manager.getAllTools(),  // Custom MCP tools
  ],
})
```

---

## Advanced Patterns

### Error Handling in Tools

```typescript
const robustTool = tool({
  name: "robust_operation",
  description: "Performs operation with error handling",
  schema: z.object({ input: z.string() }),
  execute: async ({ input }) => {
    try {
      const result = await riskyOperation(input)
      return {
        content: JSON.stringify(result),
        metadata: { success: true },
      }
    } catch (error) {
      return {
        content: `Operation failed: ${error.message}`,
        isError: true,
        metadata: { errorType: error.name },
      }
    }
  },
})
```

### Tools with Side Effects

```typescript
const databaseTool = tool({
  name: "update_record",
  description: "Update a database record",
  schema: z.object({
    id: z.string().describe("Record ID"),
    data: z.record(z.unknown()).describe("Fields to update"),
  }),
  execute: async ({ id, data }, context) => {
    // Log for audit
    console.log(`[${context.sessionId}] Updating record ${id}`)

    const result = await db.update(id, data)

    return {
      content: `Updated record ${id}`,
      metadata: {
        updatedFields: Object.keys(data),
        timestamp: Date.now(),
      },
    }
  },
})
```

### Stateful Tools

```typescript
// Create a tool factory for stateful tools
function createCounterTool() {
  let count = 0

  return tool({
    name: "counter",
    description: "Increment and get counter value",
    schema: z.object({
      action: z.enum(["increment", "decrement", "get", "reset"]),
    }),
    execute: async ({ action }) => {
      switch (action) {
        case "increment":
          count++
          break
        case "decrement":
          count--
          break
        case "reset":
          count = 0
          break
      }
      return `Counter value: ${count}`
    },
  })
}

const counterTool = createCounterTool()
```

### Tool Composition

```typescript
// Helper tools
const fetchTool = tool({
  name: "fetch_url",
  description: "Fetch content from URL",
  schema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const response = await fetch(url)
    return await response.text()
  },
})

const parseTool = tool({
  name: "parse_json",
  description: "Parse JSON string",
  schema: z.object({ json: z.string() }),
  execute: async ({ json }) => {
    return JSON.stringify(JSON.parse(json), null, 2)
  },
})

// Composed tool
const fetchJsonTool = tool({
  name: "fetch_json",
  description: "Fetch and parse JSON from URL",
  schema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const response = await fetch(url)
    const data = await response.json()
    return JSON.stringify(data, null, 2)
  },
})
```

---

## Best Practices

### 1. Clear Tool Names

Use descriptive, action-oriented names:

```typescript
// Good
name: "search_documents"
name: "create_user"
name: "delete_file"

// Bad
name: "search"
name: "user"
name: "file"
```

### 2. Comprehensive Descriptions

Help Claude understand when to use each tool:

```typescript
// Good
description: "Search documents by keyword. Returns matching documents with relevance scores. Use for finding specific content in the document library."

// Bad
description: "Search documents"
```

### 3. Validate Inputs

Use Zod for runtime validation:

```typescript
schema: z.object({
  email: z.string().email().describe("Valid email address"),
  age: z.number().min(0).max(150).describe("Age in years"),
  url: z.string().url().describe("Valid URL"),
})
```

### 4. Return Structured Data

Return consistent, parseable output:

```typescript
execute: async ({ query }) => {
  const results = await search(query)
  return JSON.stringify({
    count: results.length,
    items: results,
    query,
  }, null, 2)
}
```

### 5. Handle Timeouts

Use abort signals for long operations:

```typescript
execute: async ({ url }, context) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([
        context.abortSignal,
        controller.signal,
      ]),
    })
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}
```
