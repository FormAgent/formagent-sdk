// @ts-nocheck
/**
 * @deprecated This is legacy code. Use the new Session API from "../session" instead.
 */
import type {
  AgentConfig,
  AgentInput,
  AgentOptions,
  AgentResult,
  AgentChunk,
  ToolEvent,
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  LLMMessage,
  ToolDefinition,
  AgentEventEmitter,
} from "../types"
import { ToolRegistry } from "../tools/registry"
import { SkillLoader } from "../skills/loader"
import { StreamProcessor } from "../stream/processor"
import { OpenAIProvider } from "../llm/openai"

export class Agent {
  private config: AgentConfig
  private toolRegistry: ToolRegistry
  private skillLoader: SkillLoader
  private streamProcessor: StreamProcessor
  private emitter: AgentEventEmitter
  private llmProvider: OpenAIProvider

  private messages: Message[] = []
  private currentStep = 0
  private toolCalls: Map<string, any> = new Map()
  private pendingToolCalls: Map<string, any> = new Map()

  constructor(config: AgentConfig) {
    this.config = config
    this.toolRegistry = new ToolRegistry()
    this.skillLoader = new SkillLoader()
    this.emitter = new AgentEventEmitter()
    this.streamProcessor = new StreamProcessor(this.emitter)
    this.llmProvider = new OpenAIProvider()

    this.initializeTools()
    this.initializeSkills()
  }

  private initializeTools(): void {
    if (this.config.tools) {
      for (const tool of this.config.tools) {
        this.toolRegistry.register(tool)
      }
    }
  }

  private initializeSkills(): void {
    if (this.config.skills) {
      for (const skill of this.config.skills) {
        this.skillLoader.register(skill)
      }
    }
  }

  async run(input: AgentInput, options?: AgentOptions): Promise<AgentResult> {
    const { sessionId, userMessage, abortSignal } = input

    this.messages.push(userMessage)
    this.setupEventHandlers(options)

    try {
      while (!abortSignal.aborted) {
        this.currentStep++
        const lastUserMessage = this.getLastUserMessage()
        const assistantMessage = await this.processStep(lastUserMessage, abortSignal)

        if (!assistantMessage) {
          break
        }

        this.messages.push(assistantMessage)

        if (this.shouldStop(assistantMessage)) {
          break
        }

        if (this.shouldCompact()) {
          await this.compactMessages()
        }
      }

      return this.buildResult(sessionId)
    } catch (error) {
      this.emitter.emit("error", error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  private async processStep(userMessage: UserMessage, abortSignal: AbortSignal): Promise<AssistantMessage | null> {
    const systemMessages = this.buildSystemMessages()
    const historyMessages = this.buildHistoryMessages()
    const allMessages: LLMMessage[] = [...systemMessages, ...historyMessages]

    const toolDefinitions = this.toolRegistry.getAll()

    const stream = await this.llmProvider.stream({
      messages: allMessages,
      tools: toolDefinitions,
      llmConfig: this.config.llmConfig,
      abortSignal,
      onChunk: async (chunk) => {
        await this.streamProcessor.processChunk(chunk)
        await options?.onChunk?.({
          type: "text",
          delta: chunk.delta || "",
          content: this.streamProcessor.getText(),
        })
      },
    })

    let assistantMessage: AssistantMessage | null = null
    let currentContent = ""

    for await (const chunk of stream) {
      if (abortSignal.aborted) {
        break
      }

      if (chunk.type === "tool_call" && chunk.toolCall) {
        await this.handleToolCall(chunk.toolCall, abortSignal)
      }

      if (chunk.type === "finish") {
        assistantMessage = {
          id: this.generateId(),
          role: "assistant",
          timestamp: Date.now(),
          content: [{ type: "text", text: currentContent }, ...this.collectToolResults()],
          finishReason: chunk.finishReason,
          usage: chunk.usage,
        }
        break
      }

      if (chunk.type === "text_delta") {
        currentContent += chunk.delta || ""
      }
    }

    if (assistantMessage) {
      await options?.onMessageComplete?.(assistantMessage)
    }

    return assistantMessage
  }

  private async handleToolCall(
    toolCall: { id: string; name: string; input: Record<string, any> },
    abortSignal: AbortSignal,
  ): Promise<void> {
    this.pendingToolCalls.set(toolCall.id, toolCall)

    const tool = this.toolRegistry.get(toolCall.name)
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`)
    }

    try {
      const context = {
        abortSignal,
        sessionId: this.messages[0]?.id || "unknown",
        async notify(event) {
          this.emitter.emit("tool_call", event)
          await this.streamProcessor.processChunk({
            type: "tool_call",
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            },
          })
        },
      }

      const result = await this.toolRegistry.execute(toolCall.name, toolCall.input, context)

      this.toolCalls.set(toolCall.id, result)

      this.emitter.emit("tool_call", {
        type: "result",
        toolId: toolCall.id,
        result,
      })

      await this.streamProcessor.processChunk({
        type: "tool_result",
        toolCallId: toolCall.id,
        output: result.output,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.emitter.emit("tool_call", {
        type: "error",
        toolId: toolCall.id,
        error: errorMessage,
      })

      await this.streamProcessor.processChunk({
        type: "tool_result",
        toolCallId: toolCall.id,
        error: errorMessage,
      })
    } finally {
      this.pendingToolCalls.delete(toolCall.id)
    }
  }

  private buildSystemMessages(): SystemMessage[] {
    const messages: SystemMessage[] = []

    if (this.config.systemPrompt) {
      messages.push({
        id: this.generateId(),
        role: "system",
        timestamp: Date.now(),
        content: this.config.systemPrompt,
      })
    }

    return messages
  }

  private buildHistoryMessages(): LLMMessage[] {
    return this.messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "system", content: (msg as SystemMessage).content }
      }

      if (msg.role === "user") {
        const userMsg = msg as UserMessage
        const content: any[] = []

        for (const part of userMsg.content) {
          if (part.type === "text") {
            content.push({ type: "text", text: part.text })
          }

          if (part.type === "image") {
            content.push({ type: "image", url: part.url })
          }
        }

        return { role: "user", content }
      }

      if (msg.role === "assistant") {
        const assistantMsg = msg as AssistantMessage
        const content: any[] = []

        for (const part of assistantMsg.content) {
          if (part.type === "text") {
            content.push({ type: "text", text: part.text })
          }

          if (part.type === "tool_result") {
            content.push({
              type: "tool_result",
              toolCallId: part.toolCallId,
              output: part.output,
            })
          }
        }

        return { role: "assistant", content }
      }

      return { role: "assistant", content: [] }
    })
  }

  private collectToolResults(): any[] {
    return Array.from(this.toolCalls.values()).map((result, index) => ({
      type: "tool_result",
      toolCallId: Array.from(this.toolCalls.keys())[index],
      output: result.output,
    }))
  }

  private shouldStop(message: AssistantMessage): boolean {
    if (message.finishReason && !["tool_calls", "length", "content_filter"].includes(message.finishReason)) {
      return true
    }

    if (this.config.maxSteps && this.currentStep >= this.config.maxSteps) {
      return true
    }

    return false
  }

  private shouldCompact(): boolean {
    if (!this.config.enableCompaction) {
      return false
    }

    const totalTokens = this.messages.reduce((sum, msg) => {
      if (msg.role === "assistant" && msg.usage) {
        return sum + msg.usage.totalTokens
      }
      return sum
    }, 0)

    const threshold = this.config.compactionThreshold || 100000

    return totalTokens > threshold
  }

  private async compactMessages(): Promise<void> {
    const lastUserMessage = this.getLastUserMessage()
    if (!lastUserMessage) {
      return
    }

    const compactedMessage: Message = {
      id: this.generateId(),
      role: "system",
      timestamp: Date.now(),
      content: `Previous conversation has been compacted. Last user message: ${lastUserMessage.content[0]?.text}`,
    }

    this.messages = [compactedMessage, ...this.messages.slice(-10)]
    this.toolCalls.clear()
    this.pendingToolCalls.clear()
  }

  private getLastUserMessage(): UserMessage | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") {
        return this.messages[i] as UserMessage
      }
    }
    return null
  }

  private buildResult(sessionId: string): AgentResult {
    const lastAssistantMessage = this.messages.filter((msg) => msg.role === "assistant")[
      this.messages.length - 1
    ] as AssistantMessage

    const totalTokens = this.messages.reduce(
      (sum, msg) => {
        if (msg.role === "assistant" && msg.usage) {
          return {
            input: sum.input + msg.usage.inputTokens,
            output: sum.output + msg.usage.outputTokens,
            total: sum.total + msg.usage.totalTokens,
          }
        }
        return sum
      },
      { input: 0, output: 0, total: 0 },
    )

    const toolCallsCount = Array.from(this.toolCalls.values()).length

    return {
      sessionId,
      messages: this.messages,
      finalMessage: lastAssistantMessage,
      finishReason: lastAssistantMessage?.finishReason || "completed",
      totalTokens,
      toolCalls: toolCallsCount,
      steps: this.currentStep,
    }
  }

  private setupEventHandlers(options?: AgentOptions): void {
    if (options?.onChunk) {
      this.emitter.on("chunk", options.onChunk)
    }

    if (options?.onToolCall) {
      this.emitter.on("tool_call", options.onToolCall)
    }

    if (options?.onMessageComplete) {
      this.emitter.on("message_complete", options.onMessageComplete)
    }

    if (options?.onError) {
      this.emitter.on("error", options.onError)
    }

    if (options?.onComplete) {
      this.emitter.on("complete", options.onComplete)
    }
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return this.emitter.on(event as any, listener)
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  getMessages(): Message[] {
    return [...this.messages]
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry
  }

  getSkillLoader(): SkillLoader {
    return this.skillLoader
  }

  reset(): void {
    this.messages = []
    this.currentStep = 0
    this.toolCalls.clear()
    this.pendingToolCalls.clear()
    this.streamProcessor.reset()
  }
}
