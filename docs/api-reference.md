# API Reference

Complete API documentation for `formagent-sdk`.

## Table of Contents

- [Session API](#session-api)
- [Prompt API](#prompt-api)
- [Tool API](#tool-api)
- [MCP API](#mcp-api)
- [Provider API](#provider-api)
- [Types](#types)

---

## Session API

### `createSession(options?)`

Create a new conversation session.

```typescript
import { createSession } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  systemPrompt: "You are a helpful assistant.",
})
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `string` | Model identifier (e.g., "claude-sonnet-4-20250514") |
| `tools` | `ToolDefinition[]` | Array of tool definitions |
| `systemPrompt` | `string \| SystemPromptConfig` | System prompt configuration |
| `maxTurns` | `number` | Maximum assistant turns before stopping |
| `allowedTools` | `string[] \| { allow?: string[]; deny?: string[] }` | Filter allowed tools (supports `*` wildcards) |
| `provider` | `LLMProvider` | Custom LLM provider |

**Returns:** `Promise<Session>`

---

### `Session`

Session interface for managing conversations.

#### `session.send(message, options?)`

Send a message to the session.

```typescript
await session.send("Hello, Claude!")

// With structured message
await session.send({
  role: "user",
  content: "Hello!",
})
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string \| SDKMessage` | User message |
| `options.abortSignal` | `AbortSignal` | Cancellation signal |

**Returns:** `Promise<void>`

---

#### `session.receive(options?)`

Receive streaming response from the session.

```typescript
for await (const event of session.receive()) {
  if (event.type === "text") {
    process.stdout.write(event.text)
  }
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.abortSignal` | `AbortSignal` | Cancellation signal |
| `options.continue` | `boolean` | Continue from previous response |

**Returns:** `AsyncGenerator<SessionEvent>`

**Event Types:**

| Type | Properties | Description |
|------|------------|-------------|
| `text` | `text: string` | Text content chunk |
| `tool_use` | `id, name, input` | Tool invocation |
| `tool_result` | `tool_use_id, content, is_error` | Tool execution result |
| `message` | `message: SDKMessage` | Complete message |
| `stop` | `stop_reason, usage` | Generation complete |
| `error` | `error: Error` | Error occurred |

---

#### `session.getMessages()`

Get conversation history.

```typescript
const messages = session.getMessages()
console.log(messages.length)
```

**Returns:** `SDKMessage[]`

---

#### `session.getUsage()`

Get accumulated token usage.

```typescript
const usage = session.getUsage()
console.log(`Input: ${usage.input_tokens}, Output: ${usage.output_tokens}`)
```

**Returns:** `ExtendedUsageInfo`

---

#### `session.close()`

Close the session and release resources.

```typescript
await session.close()
```

**Returns:** `Promise<void>`

---

### `resumeSession(sessionId, options?)`

Resume an existing session.

```typescript
const session = await resumeSession("sess_abc123")
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | `string` | Session ID to resume |
| `options` | `Partial<SessionConfig>` | Additional configuration |

**Returns:** `Promise<Session>`

---

### `forkSession(sessionId, options?)`

Create a new session from existing conversation history.

```typescript
const forkedSession = await forkSession("sess_abc123", {
  systemPrompt: "New system prompt",
})
```

**Returns:** `Promise<Session>`

---

## Prompt API

### `prompt(input, options?)`

Simple single-turn prompt function.

```typescript
import { prompt } from "formagent-sdk"

// Simple usage
const response = await prompt("What is 2+2?")

// With full result
const result = await prompt("Hello!", { textOnly: false })
console.log(result.text)
console.log(result.usage)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` | User prompt |
| `options.model` | `string` | Model to use |
| `options.systemPrompt` | `string` | System prompt |
| `options.textOnly` | `boolean` | Return text only (default: true) |

**Returns:** `Promise<string>` or `Promise<PromptResult>`

---

## Tool API

### `tool(options)` / `tool(name, description, schema, execute)`

Create a tool definition.

```typescript
import { tool } from "formagent-sdk"
import { z } from "zod"

// Style 1: Options object
const myTool = tool({
  name: "my_tool",
  description: "Does something useful",
  schema: z.object({
    input: z.string().describe("Input value"),
  }),
  execute: async ({ input }) => {
    return `Result: ${input}`
  },
})

// Style 2: Claude SDK style (positional arguments)
const myTool = tool(
  "my_tool",
  "Does something useful",
  { input: z.string().describe("Input value") },
  async ({ input }) => `Result: ${input}`
)
```

**Parameters (Options style):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Unique tool name |
| `description` | `string` | Tool description for Claude |
| `schema` | `JSONSchema \| ZodSchema` | Input parameter schema |
| `execute` | `Function` | Execution function |

**Returns:** `ToolDefinition`

---

### `simpleTool(name, description, execute)`

Create a simple tool with no parameters.

```typescript
const timeTool = simpleTool(
  "get_time",
  "Get the current time",
  async () => new Date().toISOString()
)
```

**Returns:** `ToolDefinition`

---

### `builtinTools`

Pre-configured collection of all built-in tools.

```typescript
import { builtinTools } from "formagent-sdk"

const session = await createSession({
  tools: builtinTools, // Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite
})
```

---

### `fileTools`

Collection of file operation tools only.

```typescript
import { fileTools } from "formagent-sdk"

const session = await createSession({
  tools: fileTools, // Read, Write, Edit, Glob, Grep
})
```

---

### `createBuiltinTools(options)`

Create built-in tools with custom configuration.

```typescript
const tools = createBuiltinTools({
  cwd: "/my/project",
  defaultTimeout: 60000,
  allowedPaths: ["/my/project"],
  blockedPaths: ["/etc", "/root"],
  allowDangerous: false,
  allowPrivateNetwork: false,
})
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `cwd` | `string` | Working directory |
| `defaultTimeout` | `number` | Default timeout in ms |
| `allowedPaths` | `string[]` | Allowed directories for file tools (defaults to `cwd`) |
| `blockedPaths` | `string[]` | Blocked directories for file tools |
| `allowDangerous` | `boolean` | Disable Bash denylist when true |
| `allowPrivateNetwork` | `boolean` | Allow localhost/private network targets for WebFetch when true |
| `resolveHostnames` | `boolean` | Resolve hostnames and block private IP ranges for WebFetch (default true) |

**Returns:** `ToolDefinition[]`

---

### `ToolManager`

Manage tool registration and execution.

```typescript
import { ToolManager } from "formagent-sdk"

const manager = new ToolManager({
  allowedTools: ["read", "write"],
})

manager.register(myTool)

const result = await manager.execute("my_tool", { input: "test" }, context)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `register(tool)` | Register a tool |
| `unregister(name)` | Remove a tool |
| `get(name)` | Get tool by name |
| `getAll()` | Get all registered tools |
| `execute(name, input, context)` | Execute a tool |

---

### Todo Utilities

```typescript
import { getTodos, clearTodos, setTodoChangeCallback } from "formagent-sdk"

// Get current todos
const todos = getTodos()

// Clear all todos
clearTodos()

// Listen for changes
setTodoChangeCallback((todos) => {
  console.log("Todos updated:", todos)
})
```

---

## MCP API

### `createSdkMcpServer(options)`

Create an MCP server from tool definitions.

```typescript
import { createSdkMcpServer, tool } from "formagent-sdk"

const server = createSdkMcpServer({
  name: "my-server",
  version: "1.0.0",
  tools: [myTool1, myTool2],
})
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Server name |
| `version` | `string` | Server version |
| `tools` | `ToolDefinition[]` | Tools to expose |

**Returns:** `MCPServer`

---

### `MCPServerManager`

Manage multiple MCP servers.

```typescript
import { MCPServerManager } from "formagent-sdk"

const manager = new MCPServerManager()
manager.addServer("weather", weatherServer)
manager.addServer("calc", calculatorServer)

const allTools = manager.getAllTools()
```

---

### MCP Tool Naming

MCP tools are namespaced with the pattern: `mcp__{serverName}__{toolName}`

```typescript
// Tool "get_weather" on server "weather" becomes:
// mcp__weather__get_weather

const session = await createSession({
  tools: manager.getAllTools(),
  allowedTools: ["mcp__weather__*"], // Allow all weather tools
})
```

---

## Provider API

### `AnthropicProvider`

Anthropic Claude provider.

```typescript
import { AnthropicProvider } from "formagent-sdk"

// Auto-reads from ANTHROPIC_API_KEY env var
const provider = new AnthropicProvider()

// Or explicit configuration
const provider = new AnthropicProvider({
  apiKey: "your-key",
  baseUrl: "https://api.anthropic.com",
})
```

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key |
| `ANTHROPIC_BASE_URL` | Custom endpoint |

---

### `OpenAIProvider`

OpenAI compatible provider.

```typescript
import { OpenAIProvider } from "formagent-sdk"

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
})
```

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key |
| `OPENAI_BASE_URL` | Custom endpoint |

---

### `setDefaultProvider(provider)`

Set the global default provider.

```typescript
import { setDefaultProvider, AnthropicProvider } from "formagent-sdk"

setDefaultProvider(new AnthropicProvider())
```

---

## Types

### `SessionEvent`

```typescript
type SessionEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "message"; message: SDKMessage }
  | { type: "stop"; stop_reason: string; usage: ExtendedUsageInfo }
  | { type: "error"; error: Error }
```

### `ToolDefinition`

```typescript
interface ToolDefinition<TInput = unknown> {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (input: TInput, context: ToolContext) => Promise<ToolOutput>
}
```

### `ToolOutput`

```typescript
interface ToolOutput {
  content: string | ContentBlock[]
  isError?: boolean
  metadata?: Record<string, unknown>
}
```

### `ToolContext`

```typescript
interface ToolContext {
  sessionId: string
  abortSignal: AbortSignal
}
```

### `ExtendedUsageInfo`

```typescript
interface ExtendedUsageInfo {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}
```

### `SDKMessage`

```typescript
interface SDKMessage {
  id?: string
  role: "user" | "assistant"
  content: string | ContentBlock[]
  stop_reason?: string
  usage?: ExtendedUsageInfo
}
```
