# FormAgent SDK

A powerful AI Agent framework for building intelligent assistants with streaming support, tool execution, skills, hooks, and MCP integration.

[![npm version](https://badge.fury.io/js/formagent-sdk.svg)](https://www.npmjs.com/package/formagent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Session-Based API**: Multi-turn conversations with state management
- **Streaming Support**: Real-time streaming of LLM responses with event-based notifications
- **Built-in Tools**: File operations, bash execution, web fetch, and task management
- **Tool System**: Flexible tool registration with Zod schema support
- **Skills System**: Extend agent capabilities with discoverable skills
- **Hooks System**: Intercept and control agent behavior (PreToolUse, PostToolUse)
- **Structured Outputs**: JSON Schema validated responses
- **MCP Integration**: Model Context Protocol server support
- **Multi-Provider**: Support for Anthropic Claude and OpenAI models
- **Cost Tracking**: Token usage and cost estimation
- **Type-Safe**: Full TypeScript support with strict typing
- **Zero Config**: Auto-reads API keys from environment variables

## Installation

```bash
npm install formagent-sdk
# or
bun add formagent-sdk
# or
yarn add formagent-sdk
```

## Quick Start

### One-Shot Prompts

```typescript
import { prompt } from "formagent-sdk"

const response = await prompt("What is 2+2?")
console.log(response) // "4"
```

### Sessions with Tools

```typescript
import { createSession, builtinTools } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
})

await session.send("List all TypeScript files in the current directory")

for await (const event of session.receive()) {
  if (event.type === "text") {
    process.stdout.write(event.text)
  } else if (event.type === "tool_use") {
    console.log(`Using tool: ${event.name}`)
  }
}

await session.close()
```

## Environment Variables

The SDK automatically reads configuration from environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required for Claude models) |
| `ANTHROPIC_BASE_URL` | Custom Anthropic API endpoint |
| `OPENAI_API_KEY` | OpenAI API key (for GPT models) |
| `OPENAI_BASE_URL` | Custom OpenAI API endpoint |

```bash
export ANTHROPIC_API_KEY=your-api-key
```

## Custom Tools

```typescript
import { tool } from "formagent-sdk"
import { z } from "zod"

const weatherTool = tool({
  name: "get_weather",
  description: "Get the current weather for a location",
  schema: z.object({
    location: z.string().describe("City name"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ location, unit = "celsius" }) => {
    return `Weather in ${location}: 22°${unit === "celsius" ? "C" : "F"}`
  },
})

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: [weatherTool],
})
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| **Bash** | Execute bash commands with timeout support |
| **Read** | Read file contents with optional line range |
| **Write** | Write content to files, creates directories |
| **Edit** | Find/replace text in files |
| **Glob** | Find files matching glob patterns |
| **Grep** | Search file contents with regex |
| **WebFetch** | Fetch URL content, converts HTML to markdown |
| **TodoWrite** | Manage task lists for progress tracking |
| **Skill** | Discover and invoke specialized skills |

**Security defaults (important):**
- File tools (`Read`/`Write`/`Edit`/`Glob`/`Grep`) are restricted to `process.cwd()` by default; configure `allowedPaths` to widen access.
- `WebFetch` blocks localhost/private network targets by default; set `allowPrivateNetwork: true` to override.
- `Bash` blocks a small set of high-risk command patterns by default; set `allowDangerous: true` to disable the denylist.

```typescript
import { builtinTools, fileTools, createBuiltinTools } from "formagent-sdk"

// Use all built-in tools
const session = await createSession({
  tools: builtinTools,
})

// Or use just file tools (Read, Write, Edit, Glob, Grep)
const session = await createSession({
  tools: fileTools,
})

// Or configure access boundaries explicitly
const tools = createBuiltinTools({
  cwd: process.cwd(),
  allowedPaths: [process.cwd()],
  allowPrivateNetwork: false,
  allowDangerous: false,
})
```

## Skills System

Load skills from directories to extend agent capabilities:

```typescript
import { createSession, DEFAULT_USER_SKILLS_PATH } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  settingSources: [
    DEFAULT_USER_SKILLS_PATH, // ~/.claude/skills
    "/path/to/project/skills",
  ],
})

// Claude can now use the Skill tool to discover and invoke skills
await session.send("What skills are available?")
```

## Hooks System

Intercept and control tool execution:

```typescript
import { createSession, builtinTools, type HookCallback } from "formagent-sdk"

const protectEnvFiles: HookCallback = async (input, toolUseId, context) => {
  const filePath = input.tool_input?.file_path as string

  if (filePath?.endsWith(".env")) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Cannot modify .env files",
      },
    }
  }
  return {}
}

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  hooks: {
    PreToolUse: [
      { matcher: "Write|Edit", hooks: [protectEnvFiles] },
    ],
  },
})
```

## Structured Outputs

Get validated JSON responses:

```typescript
import { createSession } from "formagent-sdk"

const session = await createSession({
  model: "claude-sonnet-4-20250514",
  outputFormat: {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        score: { type: "number" },
      },
      required: ["summary"],
    },
  },
})

for await (const event of session.receive()) {
  if (event.type === "result" && event.structured_output) {
    console.log(event.structured_output)
  }
}
```

## Session Management

Resume and fork sessions:

```typescript
import { createSession, resumeSession, forkSession } from "formagent-sdk"

// Create a session
const session = await createSession({ model: "claude-sonnet-4-20250514" })
const sessionId = session.id

// Later: Resume the session
const resumed = await resumeSession(sessionId)

// Or: Fork the session (create a branch)
const forked = await forkSession(sessionId)
```

## Event Types

The `receive()` method yields different event types:

| Type | Properties | Description |
|------|------------|-------------|
| `text` | `text: string` | Text content chunk |
| `tool_use` | `id, name, input` | Tool invocation |
| `tool_result` | `tool_use_id, content, is_error` | Tool execution result |
| `message` | `message: SDKMessage` | Complete message |
| `result` | `structured_output` | Structured output (when configured) |
| `stop` | `stop_reason, usage` | Generation complete |
| `error` | `error: Error` | Error occurred |

## Examples

See the [examples](./examples) directory for complete examples:

- Basic sessions and prompts
- Streaming responses
- Custom tools and MCP servers
- Skills and hooks
- Structured outputs
- CLI agent implementation

## Documentation

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [Built-in Tools](./docs/tools.md)
- [MCP Servers](./docs/mcp-servers.md)

## License

MIT
