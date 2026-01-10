# Built-in Tools

Comprehensive documentation for all built-in tools in `formagent-sdk`.

## Table of Contents

- [Overview](#overview)
- [Using Built-in Tools](#using-built-in-tools)
- [Bash](#bash)
- [Read](#read)
- [Write](#write)
- [Edit](#edit)
- [Glob](#glob)
- [Grep](#grep)
- [WebFetch](#webfetch)
- [TodoWrite](#todowrite)
- [Creating Custom Tools](#creating-custom-tools)

---

## Overview

The SDK provides a collection of built-in tools that enable Claude to interact with the file system, execute commands, fetch web content, and manage tasks.

### Tool Collections

| Collection | Tools Included | Use Case |
|------------|---------------|----------|
| `builtinTools` | All tools | Full agent capabilities |
| `fileTools` | Read, Write, Edit, Glob, Grep | File operations only |

---

## Using Built-in Tools

### All Built-in Tools

```typescript
import { createSession, builtinTools } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
})
```

### File Tools Only

```typescript
import { createSession, fileTools } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: fileTools,
})
```

### Custom Configuration

```typescript
import { createBuiltinTools } from "formagent-sdk"

const tools = createBuiltinTools({
  cwd: "/my/project",
  defaultTimeout: 60000,
})

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools,
})
```

---

## Bash

Execute bash commands with timeout support.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | `string` | Yes | The command to execute |
| `timeout` | `number` | No | Timeout in milliseconds (default: 30000) |

### Example Usage

When Claude needs to run system commands:

```
User: "List all TypeScript files in the src directory"
Claude: [Uses Bash tool with command: "find src -name '*.ts'"]
```

### Security Notes

- This SDK does not provide an OS-level sandbox. Treat built-in tools as “real local effects”.
- By default, `Bash` blocks a small set of high-risk command patterns; set `allowDangerous: true` in `createBuiltinTools()` to disable the denylist.
- By default, file tools are restricted to `allowedPaths` (defaults to `cwd`).

---

## Read

Read file contents with optional line range.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | `string` | Yes | Absolute path to the file |
| `offset` | `number` | No | Starting line number (1-indexed) |
| `limit` | `number` | No | Number of lines to read |

### Example Usage

```
User: "Show me the contents of package.json"
Claude: [Uses Read tool with file_path: "/path/to/package.json"]
```

### Reading Partial Files

For large files, you can read specific sections:

```typescript
// Read lines 100-200
{ file_path: "/path/to/large-file.ts", offset: 100, limit: 100 }
```

### Security Notes

- File access is restricted to `allowedPaths` (defaults to `cwd`). Use `createBuiltinTools({ allowedPaths: ["/"] })` to allow anywhere.

---

## Write

Write content to files, creating directories as needed.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | `string` | Yes | Absolute path for the file |
| `content` | `string` | Yes | Content to write |

### Example Usage

```
User: "Create a new file called hello.ts with a simple function"
Claude: [Uses Write tool with file_path and content]
```

### Behavior

- Creates parent directories if they don't exist
- Overwrites existing files
- Preserves file permissions where possible

### Security Notes

- File access is restricted to `allowedPaths` (defaults to `cwd`).

---

## Edit

Find and replace text in files.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | `string` | Yes | Absolute path to the file |
| `old_string` | `string` | Yes | Text to find |
| `new_string` | `string` | Yes | Replacement text |

### Example Usage

```
User: "Change the function name from 'getData' to 'fetchData'"
Claude: [Uses Edit tool to find and replace]
```

### Behavior

- Matches exact strings (not regex)
- Preserves surrounding content
- Returns error if old_string not found

### Security Notes

- File access is restricted to `allowedPaths` (defaults to `cwd`).

---

## Glob

Find files matching glob patterns.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | `string` | Yes | Glob pattern to match |
| `path` | `string` | No | Base directory (default: cwd) |

### Supported Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| `*` | Match any characters in filename | `*.ts` |
| `**` | Match any directories | `src/**/*.ts` |
| `?` | Match single character | `file?.ts` |
| `[abc]` | Match character set | `file[123].ts` |
| `{a,b}` | Match alternatives | `*.{ts,js}` |

### Example Usage

```
User: "Find all test files"
Claude: [Uses Glob with pattern: "**/*.test.ts"]
```

---

## Grep

Search file contents with regex support.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | `string` | Yes | Regex pattern to search |
| `path` | `string` | No | File or directory to search |
| `glob` | `string` | No | Glob pattern to filter files (e.g., "*.ts") |

### Example Usage

```
User: "Find all functions that start with 'handle'"
Claude: [Uses Grep with pattern: "function handle"]
```

### Regex Support

Full JavaScript regex syntax is supported:

```typescript
// Find imports
{ pattern: "^import.*from" }

// Find TODO comments
{ pattern: "TODO:|FIXME:" }

// Find function definitions
{ pattern: "function\\s+\\w+\\(" }
```

---

## WebFetch

Fetch URL content and convert HTML to markdown.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | Yes | URL to fetch |
| `prompt` | `string` | No | Instructions for processing |

### Example Usage

```
User: "Get the main content from https://example.com"
Claude: [Uses WebFetch tool]
```

### Features

- Converts HTML to readable markdown
- Denies redirects to a different host
- Supports common content types
- Extracts main content from pages

### Security Notes

- By default, WebFetch blocks localhost/private network targets (SSRF protection). Set `allowPrivateNetwork: true` to override.

---

## TodoWrite

Manage task lists for progress tracking.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `todos` | `Todo[]` | Yes | Array of todo items |

### Todo Item Structure

```typescript
interface Todo {
  content: string      // Task description
  status: "pending" | "in_progress" | "completed"
  activeForm: string   // Present tense description
}
```

### Example Usage

```typescript
// Create a task list
{
  todos: [
    { content: "Analyze requirements", status: "completed", activeForm: "Analyzing requirements" },
    { content: "Implement feature", status: "in_progress", activeForm: "Implementing feature" },
    { content: "Write tests", status: "pending", activeForm: "Writing tests" },
  ]
}
```

### Managing Todos Programmatically

```typescript
import { getTodos, clearTodos, setTodoChangeCallback } from "formagent-sdk"

// Get current todos
const todos = getTodos()
console.log(todos)

// Clear all todos
clearTodos()

// Listen for changes
setTodoChangeCallback((todos) => {
  console.log("Todos updated:", todos)
  // Update UI, save to database, etc.
})
```

---

## Creating Custom Tools

### Using the `tool()` Helper

```typescript
import { tool } from "formagent-sdk"
import { z } from "zod"

// Style 1: Options object (recommended)
const weatherTool = tool({
  name: "get_weather",
  description: "Get the current weather for a location",
  schema: z.object({
    location: z.string().describe("City name"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ location, unit = "celsius" }) => {
    // Call weather API
    const temp = await fetchWeather(location, unit)
    return `Weather in ${location}: ${temp}°${unit === "celsius" ? "C" : "F"}`
  },
})

// Style 2: Claude SDK style (positional arguments)
const calculatorTool = tool(
  "calculate",
  "Perform a math calculation",
  { expression: z.string().describe("Math expression to evaluate") },
  async ({ expression }) => {
    const result = evaluateExpression(expression)
    return `Result: ${result}`
  }
)
```

### Using `simpleTool()` for No-Parameter Tools

```typescript
import { simpleTool } from "formagent-sdk"

const timeTool = simpleTool(
  "get_time",
  "Get the current time",
  async () => new Date().toISOString()
)
```

### Tool Return Types

Tools can return either a string or a structured `ToolOutput`:

```typescript
// Simple string return
async execute({ input }) {
  return `Result: ${input}`
}

// Structured return with metadata
async execute({ input }) {
  return {
    content: `Result: ${input}`,
    isError: false,
    metadata: { processedAt: Date.now() },
  }
}

// Error return
async execute({ input }) {
  if (!isValid(input)) {
    return {
      content: "Invalid input provided",
      isError: true,
    }
  }
  return `Result: ${input}`
}
```

### Tool Context

Tools receive a context object with session information:

```typescript
async execute({ input }, context) {
  console.log("Session ID:", context.sessionId)

  // Check for cancellation
  if (context.abortSignal.aborted) {
    return { content: "Operation cancelled", isError: true }
  }

  return `Processed: ${input}`
}
```

---

## Tool Best Practices

### 1. Clear Descriptions

Write descriptions that help Claude understand when and how to use the tool:

```typescript
// Good
description: "Search for files by name pattern. Use glob syntax like *.ts or **/*.json"

// Bad
description: "File search"
```

### 2. Descriptive Parameter Names

Use `.describe()` on Zod schemas to document parameters:

```typescript
schema: z.object({
  query: z.string().describe("Search query - supports wildcards"),
  maxResults: z.number().optional().describe("Maximum results to return (default: 10)"),
})
```

### 3. Handle Errors Gracefully

Return meaningful error messages:

```typescript
async execute({ filePath }) {
  try {
    const content = await readFile(filePath)
    return content
  } catch (error) {
    return {
      content: `Failed to read file: ${error.message}`,
      isError: true,
    }
  }
}
```

### 4. Support Cancellation

Check the abort signal for long-running operations:

```typescript
async execute({ url }, context) {
  const response = await fetch(url, {
    signal: context.abortSignal,
  })
  return await response.text()
}
```
