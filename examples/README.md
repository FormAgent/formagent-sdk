# formagent-sdk Examples

This directory contains examples demonstrating how to use the `formagent-sdk` SDK.

## Prerequisites

Set up your API keys as environment variables:

```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export OPENAI_API_KEY="your-openai-api-key"  # Optional, for OpenAI examples
```

**Note:** The SDK automatically reads API keys from environment variables. No need to configure providers manually in your code!

## Running Examples

```bash
# Using bun
bun run examples/01-basic-session.ts

# Using ts-node
npx ts-node examples/01-basic-session.ts
```

## Examples Overview

### 01. Basic Session (`01-basic-session.ts`)

Fundamental session-based API for conversations:
- Creating sessions
- Send/receive pattern
- Multi-turn conversations
- Session resume and fork
- Automatic cleanup with `await using`

### 02. Prompt Function (`02-prompt-function.ts`)

Simple single-turn interactions:
- Basic prompts
- Streaming responses
- Custom models and parameters
- System prompt configuration
- Full result with usage info

### 03. Streaming (`03-streaming.ts`)

Streaming responses and event handling:
- Session streaming
- Query function streaming
- Handling all event types
- Aborting streams
- Collecting responses while streaming

### 04. Tools (`04-tools.ts`)

Tool definition and usage:
- Defining tools with schemas
- Tool execution
- ToolManager for tool registration
- Tool filtering (allowedTools)
- Tool events

### 05. MCP Server (`05-mcp-server.ts`)

MCP (Model Context Protocol) integration:
- Creating MCP servers from tools
- Tool namespacing (`mcp__{server}__{tool}`)
- MCPServerWrapper and MCPServerManager
- Integrating MCP with ToolManager

### 06. System Prompts (`06-system-prompts.ts`)

System prompt customization:
- Built-in presets (claude_code, default, minimal)
- Prepend/append content
- Context-based prompts
- Custom presets
- CLAUDE.md loading

### 07. Cost Tracking (`07-cost-tracking.ts`)

Token usage and cost calculation:
- Basic cost tracking
- Message deduplication
- Usage by model
- Session-specific tracking
- Cache token tracking
- Custom pricing configuration

### 08. Providers (`08-providers.ts`)

Multi-provider support:
- Anthropic provider
- OpenAI provider
- Provider resolution
- Custom patterns
- OpenAI-compatible endpoints

### 09. Skills (`09-skills.ts`)

Skill discovery and activation:
- Registering skills
- Skill discovery from SKILL.md files
- Searching skills
- Skill activation triggers
- System prompt integration

### 10. Full Agent (`10-full-agent.ts`)

Complete agent implementation:
- Combining all features
- Tool execution flow
- Skill activation
- Cost tracking
- Event handling

### 11. Skills with Skill Tool (`11-user-skills.ts`)

Skill tool that Claude can invoke to discover and use skills:
- Path-based skill sources (`settingSources` config)
- Skill tool for Claude to discover/invoke skills
- Direct skill loading and searching
- Session auto-adds Skill tool when `settingSources` is configured
- Skill activation based on triggers

### 12. Built-in Tools (`12-builtin-tools.ts`)

Claude Agent SDK compatible built-in tools:
- Using `builtinTools` collection (Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite)
- File-only tools with `fileTools` collection
- Custom configuration with `createBuiltinTools()` and `createFileTools()`
- Individual tool usage and registration
- Todo management with callbacks (`getTodos`, `clearTodos`, `setTodoChangeCallback`)
- Custom timeout and working directory options

### 13. CLI Agent (`13-cli-agent.ts`)

Interactive command-line agent similar to Claude Code:
- Multi-turn conversations with streaming
- All built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite)
- Tool call visualization with colored output
- Slash commands: `/help`, `/clear`, `/tools`, `/todos`, `/usage`, `/exit`
- Token usage tracking and cost estimation
- ANSI colored terminal output

```bash
# Run the CLI agent
bun run examples/13-cli-agent.ts

# Or make it executable
chmod +x examples/13-cli-agent.ts
./examples/13-cli-agent.ts
```

### 14. Structured Output (`14-structured-output.ts`)

Get validated JSON responses from agent workflows:
- JSON Schema output format configuration
- Zod schema support for type-safe outputs
- Result event with `structured_output` field
- Code analysis with structured results
- TODO extraction with schema validation
- Error handling for invalid outputs

### 15. Hooks (`15-hooks.ts`)

Intercept and control agent behavior with hooks:
- PreToolUse hooks (block, allow, modify inputs)
- PostToolUse hooks (logging, context injection)
- Permission decisions (allow/deny/ask)
- Protect sensitive files (.env protection)
- Block dangerous shell commands
- Audit logging for compliance
- Sandbox file operations
- Auto-approve read-only tools
- Chain multiple hooks
- Regex-based tool matchers

## API Quick Reference

### Session API

```typescript
import { createSession, resumeSession, forkSession } from "formagent-sdk"

// Create a session
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: [...],
  systemPrompt: { preset: "claude_code" },
})

// Send message
await session.send("Hello!")

// Receive response (streaming)
for await (const event of session.receive()) {
  if (event.type === "text") {
    console.log(event.text)
  }
}

// Close session
await session.close()
```

### Prompt API

```typescript
import { prompt } from "formagent-sdk"

// Simple prompt
const response = await prompt("What is 2+2?")

// With options
const response = await prompt("Write a poem", {
  model: "claude-sonnet-4-20250514",
  stream: true,
  onText: (text) => console.log(text),
})
```

### Tools API

```typescript
import { tool, ToolManager } from "formagent-sdk"

// Define a tool
const myTool = tool({
  name: "my_tool",
  description: "Does something useful",
  schema: {
    type: "object",
    properties: {
      input: { type: "string" },
    },
  },
  execute: async (input) => {
    return { content: `Result: ${input}` }
  },
})

// Use with ToolManager
const manager = new ToolManager()
manager.register(myTool)
```

### Provider API

```typescript
import { AnthropicProvider, OpenAIProvider, setDefaultProvider } from "formagent-sdk"

// Set up provider
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

setDefaultProvider(provider)
```

### Built-in Tools API

```typescript
import {
  builtinTools,
  fileTools,
  createBuiltinTools,
  getTodos,
  clearTodos,
  setTodoChangeCallback,
} from "formagent-sdk"

// Use all built-in tools
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
})

// Or use custom configured tools
const customTools = createBuiltinTools({
  cwd: "/my/project",
  defaultTimeout: 60000,
})

// Track todos
setTodoChangeCallback((todos) => {
  console.log("Todos updated:", todos)
})
const currentTodos = getTodos()
clearTodos()
```

### Structured Output API

```typescript
import { createSession } from "formagent-sdk"

// Define output schema
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

// Receive structured output
for await (const event of session.receive()) {
  if (event.type === "result" && event.structured_output) {
    console.log(event.structured_output)
  }
}
```

### Hooks API

```typescript
import {
  createSession,
  builtinTools,
  type HookCallback,
  type PreToolUseHookInput,
} from "formagent-sdk"

// Define a hook
const protectFiles: HookCallback = async (input, toolUseId, context) => {
  const preInput = input as PreToolUseHookInput
  const filePath = preInput.tool_input?.file_path as string

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

// Use hooks in session
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  hooks: {
    PreToolUse: [
      { matcher: "Write|Edit", hooks: [protectFiles] },
    ],
  },
})
```

## Additional Resources

- [SDK Documentation](../docs/)
- [Type Definitions](../src/types/)
- [API Reference](../docs/api-reference.md)
