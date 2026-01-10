/**
 * Example 10: Full Agent
 *
 * Demonstrates a complete agent setup with all features combined:
 * - Custom tools
 * - Skills integration
 * - System prompt customization
 * - Cost tracking
 * - Multi-turn conversations
 *
 * Run: bun run examples/10-full-agent.ts
 */

import {
  createSession,
  tool,
  ToolManager,
  SkillLoader,
  SystemPromptBuilderImpl,
  CostTrackerImpl,
  AnthropicProvider,
} from "../src"
import type { ToolOutput, SessionEvent } from "../src"
import { requireApiKey, runExample, main, printSubHeader } from "./_utils"

// ============================================================
// Define Tools
// ============================================================

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
    console.log(`    [Tool] Reading: ${input.path}`)
    return { content: `Contents of ${input.path}:\n\`\`\`\nHello, World!\n\`\`\`` }
  },
})

const searchCodeTool = tool({
  name: "search_code",
  description: "Search for code patterns in files",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Search pattern" },
      path: { type: "string", description: "Directory to search" },
    },
    required: ["pattern"],
  },
  execute: async (input: { pattern: string; path?: string }): Promise<ToolOutput> => {
    console.log(`    [Tool] Searching: ${input.pattern}`)
    return { content: `Found 3 matches for "${input.pattern}":\n- src/index.ts:42\n- src/utils.ts:15` }
  },
})

// ============================================================
// Agent Class
// ============================================================

class CodeAssistantAgent {
  private provider: AnthropicProvider
  private toolManager: ToolManager
  private skillLoader: SkillLoader
  private promptBuilder: SystemPromptBuilderImpl
  private costTracker: CostTrackerImpl

  constructor(apiKey: string) {
    this.provider = new AnthropicProvider({ apiKey })

    // Initialize tool manager
    this.toolManager = new ToolManager({
      onToolEvent: (event) => {
        if (event.type === "tool_start") {
          console.log(`    [Event] Tool started: ${event.toolName}`)
        }
      },
    })
    this.toolManager.register(readFileTool)
    this.toolManager.register(searchCodeTool)

    // Initialize skill loader
    this.skillLoader = new SkillLoader(process.cwd())
    this.skillLoader.register({
      id: "typescript-expert",
      name: "TypeScript Expert",
      description: "TypeScript development best practices",
      content: `## TypeScript Guidelines
- Use strict mode
- Prefer interfaces over type aliases
- Use const assertions for literal types`,
      triggers: ["typescript", "ts", ".ts"],
    })

    // Initialize other components
    this.promptBuilder = new SystemPromptBuilderImpl()
    this.costTracker = new CostTrackerImpl()
  }

  async chat(userMessage: string): Promise<void> {
    console.log(`\n  User: ${userMessage}`)

    // Check for skill activation
    const activation = await this.skillLoader.checkActivation(userMessage, {
      userMessage,
      sessionId: "main",
    })

    if (activation.shouldActivate) {
      console.log(`  [Skills: ${activation.skills.map((s) => s.name).join(", ")}]`)
    }

    // Build system prompt
    const systemPrompt = await this.promptBuilder.build({
      preset: "claude_code",
      append: activation.systemPromptAddition,
    })

    // Create session
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      provider: this.provider,
      tools: this.toolManager.getAll(),
      systemPrompt: { custom: systemPrompt },
    })

    await session.send(userMessage)

    // Process response
    process.stdout.write("  Assistant: ")
    for await (const event of session.receive()) {
      await this.handleEvent(event)
    }
    console.log()

    // Track costs
    const usage = session.getUsage()
    this.costTracker.processMessage(
      `${session.id}-response`,
      "claude-3-sonnet",
      usage,
      session.id
    )
  }

  private async handleEvent(event: SessionEvent): Promise<void> {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text)
        break
      case "tool_use":
        console.log(`\n    [Calling: ${event.name}]`)
        break
      case "stop":
        console.log(`\n    [Tokens: ${event.usage.input_tokens} in, ${event.usage.output_tokens} out]`)
        break
      case "error":
        console.error(`\n    [Error: ${event.error.message}]`)
        break
    }
  }

  getStats(): { totalCost: number; calls: number } {
    const usage = this.costTracker.getTotalUsage()
    return { totalCost: usage.totalCostUsd, calls: usage.callCount }
  }
}

// ============================================================
// Main
// ============================================================

main(async () => {
  const apiKey = requireApiKey("anthropic")

  await runExample("Full Agent Demo", async () => {
    console.log("Initializing Code Assistant Agent...")
    const agent = new CodeAssistantAgent(apiKey)

    printSubHeader("Conversation 1: File Read")
    await agent.chat("Read the contents of package.json")

    printSubHeader("Conversation 2: Code Search")
    await agent.chat("Search for 'export function' in the src directory")

    printSubHeader("Conversation 3: TypeScript (triggers skill)")
    await agent.chat("What are TypeScript best practices?")

    printSubHeader("Session Stats")
    const stats = agent.getStats()
    console.log(`Total API calls: ${stats.calls}`)
    console.log(`Total cost: $${stats.totalCost.toFixed(4)}`)
  })

  console.log("\n[All examples completed successfully!]")
})
