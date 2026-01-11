/**
 * Session implementation
 * @module formagent-sdk/session/session
 */

import type {
  Session,
  SessionConfig,
  SessionState,
  SessionEvent,
  SendOptions,
  ReceiveOptions,
} from "../types/session"
import type { SDKMessage, ExtendedUsageInfo, ContentBlock } from "../types/core"
import type { LLMProvider } from "../types/provider"
import type { ToolDefinition, ToolContext, ToolOutput } from "../types/tool"
import { generateSessionId, generateMessageId, generateToolCallId } from "../utils/id"
import { TypedEventEmitter } from "../utils/events"
import { truncateToolOutput, needsTruncation } from "../utils/truncation"
import { HooksManager } from "../hooks/manager"
import { createSkillTool } from "../tools/skill"
import { defaultSystemPromptBuilder, defaultClaudeMdLoader } from "../prompt"

/**
 * Session event types
 */
type SessionEventMap = {
  message: [SessionEvent]
  text: [SessionEvent]
  tool_use: [SessionEvent]
  tool_result: [SessionEvent]
  stop: [SessionEvent]
  error: [SessionEvent]
}

/**
 * Internal session implementation
 */
export class SessionImpl implements Session {
  readonly id: string
  readonly config: SessionConfig

  private _state: SessionState
  private provider: LLMProvider
  private tools: Map<string, ToolDefinition>
  private toolNameLookup: Map<string, string> = new Map() // lowercase -> original name
  private emitter: TypedEventEmitter<SessionEventMap>
  private pendingMessage: SDKMessage | null = null
  private isReceiving = false
  private abortController: AbortController | null = null
  private closed = false
  private hooksManager: HooksManager | null = null
  private maxTurns: number | undefined
  private enableToolRepair: boolean = true

  constructor(
    id: string,
    config: SessionConfig,
    provider: LLMProvider,
    state?: Partial<SessionState>
  ) {
    this.id = id
    this.config = config
    this.provider = provider
    this.tools = new Map()
    this.emitter = new TypedEventEmitter()

    // Initialize state
    this._state = {
      id,
      messages: state?.messages ?? [],
      usage: state?.usage ?? {
        input_tokens: 0,
        output_tokens: 0,
      },
      metadata: state?.metadata ?? {},
      createdAt: state?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      parentId: state?.parentId,
    }

    this.maxTurns = config.maxTurns

    // Register tools
    if (config.tools) {
      for (const tool of config.tools) {
        this.tools.set(tool.name, tool)
        this.toolNameLookup.set(tool.name.toLowerCase(), tool.name)
      }
    }

    // Add Skill tool when settingSources is configured
    if (config.settingSources && config.settingSources.length > 0) {
      const skillTool = createSkillTool({
        settingSources: config.settingSources,
        cwd: config.cwd,
      })
      this.tools.set(skillTool.name, skillTool)
      this.toolNameLookup.set(skillTool.name.toLowerCase(), skillTool.name)
    }

    // Apply allowed tools filter (after all tools are registered)
    this.applyAllowedToolsFilter()

    // Initialize hooks manager if hooks are configured
    if (config.hooks) {
      this.hooksManager = new HooksManager(
        config.hooks,
        id,
        config.cwd ?? process.cwd()
      )
    }
  }

  get state(): SessionState {
    return { ...this._state }
  }

  async send(message: string | SDKMessage, options?: SendOptions): Promise<void> {
    if (this.closed) {
      throw new Error("Session is closed")
    }

    if (this.isReceiving) {
      throw new Error("Cannot send while receiving")
    }

    // Normalize message
    const normalizedMessage: SDKMessage =
      typeof message === "string"
        ? {
            id: generateMessageId(),
            role: "user",
            content: message,
          }
        : {
            ...message,
            id: message.id ?? generateMessageId(),
          }

    // Store pending message
    this.pendingMessage = normalizedMessage

    // Add to message history
    this._state.messages.push(normalizedMessage)
    this._state.updatedAt = Date.now()
  }

  async *receive(options?: ReceiveOptions): AsyncGenerator<SessionEvent, void, unknown> {
    if (this.closed) {
      throw new Error("Session is closed")
    }

    if (this.isReceiving) {
      throw new Error("Already receiving")
    }

    if (!this.pendingMessage && !options?.continue) {
      throw new Error("No pending message to process")
    }

    // Max turns guard (counts assistant messages in history)
    if (this.maxTurns !== undefined) {
      const assistantCount = this._state.messages.filter((m) => m.role === "assistant").length
      if (assistantCount >= this.maxTurns) {
        this.pendingMessage = null
        yield {
          type: "stop",
          stop_reason: "max_turns",
          usage: this._state.usage,
        }
        return
      }
    }

    this.isReceiving = true
    this.abortController = new AbortController()

    const abortSignal = options?.abortSignal
      ? this.combineAbortSignals(options.abortSignal, this.abortController.signal)
      : this.abortController.signal

    try {
      // Build request
      const request = await this.buildRequest()

      // Get streaming response from provider
      const streamOptions = {
        onText: (text: string) => {
          const event: SessionEvent = { type: "text", text }
          this.emitter.emit("text", event)
        },
        onToolUse: (toolUse: { id: string; name: string; input: Record<string, unknown> }) => {
          const event: SessionEvent = {
            type: "tool_use",
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
          }
          this.emitter.emit("tool_use", event)
        },
      }

      const stream = await this.provider.stream(request, streamOptions)

      // Collect response content
      const content: ContentBlock[] = []
      let currentText = ""
      let currentToolUse: { id: string; name: string; input: string } | null = null
      let stopReason = "end_turn"
      let usage: ExtendedUsageInfo = { input_tokens: 0, output_tokens: 0 }

      for await (const event of stream) {
        if (abortSignal.aborted) {
          break
        }

        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            currentText = ""
          } else if (event.content_block.type === "tool_use") {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: "",
            }
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta" && event.delta.text) {
            currentText += event.delta.text
            yield { type: "text", text: event.delta.text }
          } else if (event.delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.input += event.delta.partial_json || ""
          }
        } else if (event.type === "content_block_stop") {
          if (currentText) {
            content.push({ type: "text", text: currentText })
            currentText = ""
          }
          if (currentToolUse) {
            // Parse the accumulated JSON input
            let parsedInput: Record<string, unknown> = {}
            try {
              parsedInput = JSON.parse(currentToolUse.input || "{}")
            } catch {
              // Ignore parse errors
            }
            // Emit tool_use event with complete input
            yield {
              type: "tool_use",
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: parsedInput,
            }
            content.push({
              type: "tool_use",
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: parsedInput,
            })
            currentToolUse = null
          }
        } else if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason
          if (event.usage?.output_tokens !== undefined) {
            usage = {
              ...usage,
              output_tokens: event.usage.output_tokens,
            }
          }
          if ((event.usage as any)?.input_tokens !== undefined) {
            usage = {
              ...usage,
              input_tokens: (event.usage as any).input_tokens,
            }
          }
        } else if (event.type === "message_start") {
          if (event.message?.usage?.input_tokens !== undefined) {
            usage = {
              ...usage,
              input_tokens: event.message.usage.input_tokens,
            }
          }
        } else if (event.type === "message_stop") {
          // Message complete
        }
      }

      // Flush any unterminated blocks (provider-agnostic safety)
      if (currentText) {
        content.push({ type: "text", text: currentText })
        currentText = ""
      }
      if (currentToolUse) {
        let parsedInput: Record<string, unknown> = {}
        try {
          parsedInput = JSON.parse(currentToolUse.input || "{}")
        } catch {
          // Ignore parse errors
        }
        yield {
          type: "tool_use",
          id: currentToolUse.id,
          name: currentToolUse.name,
          input: parsedInput,
        }
        content.push({
          type: "tool_use",
          id: currentToolUse.id,
          name: currentToolUse.name,
          input: parsedInput,
        })
        currentToolUse = null
      }

      // Create assistant message (without tool_result - those go in user messages)
      const assistantContent = content.filter((b) => b.type !== "tool_result")
      const assistantMessage: SDKMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: assistantContent,
        stop_reason: stopReason as any,
        usage,
      }

      // Add assistant message to history
      this._state.messages.push(assistantMessage)

      // Update usage
      this._state.usage = {
        input_tokens: this._state.usage.input_tokens + usage.input_tokens,
        output_tokens: this._state.usage.output_tokens + usage.output_tokens,
      }
      this._state.updatedAt = Date.now()

      // Yield message event
      yield { type: "message", message: assistantMessage }

      // Handle tool calls - execute and continue conversation
      const toolUseBlocks = assistantContent.filter((b) => b.type === "tool_use")
      if (toolUseBlocks.length > 0) {
        // Enforce maxTurns across recursive tool loops
        if (this.maxTurns !== undefined) {
          const assistantCountNow = this._state.messages.filter((m) => m.role === "assistant").length
          if (assistantCountNow >= this.maxTurns) {
            yield {
              type: "stop",
              stop_reason: "max_turns",
              usage: this._state.usage,
            }
            this.pendingMessage = null
            return
          }
        }

        const toolResults: ContentBlock[] = []

        for (const block of toolUseBlocks) {
          if (block.type === "tool_use") {
            const toolResult = await this.executeToolCall(block, abortSignal)
            yield toolResult

            // Collect tool results for user message
            if (toolResult.type === "tool_result") {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: typeof toolResult.content === "string" ? toolResult.content : "",
                is_error: toolResult.is_error,
              })
            }
          }
        }

        // Add user message with tool results
        const toolResultMessage: SDKMessage = {
          id: generateMessageId(),
          role: "user",
          content: toolResults,
        }
        this._state.messages.push(toolResultMessage)

        // Continue conversation to get assistant's response to tool results
        // Recursively yield from the continued conversation
        for await (const event of this.continueConversation(abortSignal)) {
          yield event
        }
      } else {
        // No tool calls - yield stop event and finish
        yield {
          type: "stop",
          stop_reason: stopReason,
          usage: this._state.usage,
        }
      }

      // Clear pending message
      this.pendingMessage = null
    } catch (error) {
      const errorEvent: SessionEvent = {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      }
      this.emitter.emit("error", errorEvent)
      yield errorEvent
    } finally {
      this.isReceiving = false
      this.abortController = null
    }
  }

  getMessages(): SDKMessage[] {
    return [...this._state.messages]
  }

  getUsage(): ExtendedUsageInfo {
    return { ...this._state.usage }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }

    // Abort any ongoing operation
    this.abortController?.abort()

    // Clear state
    this.emitter.removeAllListeners()
    this.tools.clear()
    this.pendingMessage = null
    this.closed = true
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  /**
   * Build LLM request from current state
   */
  private async buildRequest() {
    // Convert messages to SDK format
    const messages = this._state.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }))

    // Get tool definitions
    const tools = Array.from(this.tools.values())

    const model =
      typeof this.config.model === "string"
        ? this.config.model
        : this.config.model?.model ?? "claude-sonnet-4-20250514"

    const maxTokens =
      typeof this.config.model === "string"
        ? 4096
        : this.config.model?.maxTokens ?? 4096

    const systemPrompt = await this.buildSystemPrompt(tools.map((t) => t.name))

    return {
      messages: messages as SDKMessage[],
      tools,
      config: {
        ...((typeof this.config.model === "string" ? {} : this.config.model) ?? {}),
        model,
        maxTokens,
      },
      systemPrompt,
      abortSignal: this.abortController?.signal,
    }
  }

  /**
   * Execute a tool call with hooks support
   */
  private async executeToolCall(
    block: { type: "tool_use"; id: string; name: string; input: Record<string, unknown> },
    abortSignal: AbortSignal
  ): Promise<SessionEvent & { _hookSystemMessage?: string }> {
    let toolInput = block.input
    let systemMessage: string | undefined

    // Run PreToolUse hooks
    if (this.hooksManager) {
      const preResult = await this.hooksManager.runPreToolUse(
        block.name,
        block.input,
        block.id,
        abortSignal
      )

      // Check if execution should stop
      if (!preResult.continue) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: preResult.stopReason ?? "Execution stopped by hook",
          is_error: true,
          _hookSystemMessage: preResult.systemMessage,
        }
      }

      // Check if tool is denied
      if (!preResult.allowed) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: preResult.reason ?? `Tool "${block.name}" was denied by hook`,
          is_error: true,
          _hookSystemMessage: preResult.systemMessage,
        }
      }

      // Use updated input if provided
      if (preResult.updatedInput) {
        toolInput = preResult.updatedInput
      }

      systemMessage = preResult.systemMessage
    }

    // Try to get tool with case-insensitive matching
    let tool = this.tools.get(block.name)
    let effectiveToolName = block.name

    if (!tool && this.enableToolRepair) {
      // Try case-insensitive lookup
      const lowerName = block.name.toLowerCase()
      const originalName = this.toolNameLookup.get(lowerName)
      if (originalName) {
        tool = this.tools.get(originalName)
        effectiveToolName = originalName
      }
    }

    if (!tool) {
      // Provide helpful error with available tools
      const availableTools = Array.from(this.tools.keys()).slice(0, 10)
      const suffix = this.tools.size > 10 ? ` (and ${this.tools.size - 10} more)` : ""
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: Tool "${block.name}" not found. Available tools: ${availableTools.join(", ")}${suffix}`,
        is_error: true,
        _hookSystemMessage: systemMessage,
      }
    }

    const context: ToolContext = {
      sessionId: this.id,
      abortSignal,
    }

    let result: SessionEvent
    let toolResponse: unknown

    try {
      const toolResult = await tool.execute(toolInput, context)
      let content = typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content)

      // Apply output truncation to prevent token explosion
      if (needsTruncation(content)) {
        content = await truncateToolOutput(content)
      }

      toolResponse = toolResult

      result = {
        type: "tool_result",
        tool_use_id: block.id,
        content,
        is_error: toolResult.isError,
      }
    } catch (error) {
      toolResponse = { error: error instanceof Error ? error.message : String(error) }
      result = {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true,
      }
    }

    // Run PostToolUse hooks
    if (this.hooksManager) {
      const postResult = await this.hooksManager.runPostToolUse(
        block.name,
        toolInput,
        toolResponse,
        block.id,
        abortSignal
      )

      if (postResult.systemMessage) {
        systemMessage = postResult.systemMessage
      }

      // Add additional context if provided
      if (postResult.additionalContext && result.type === "tool_result") {
        result = {
          ...result,
          content: `${result.content}\n\n${postResult.additionalContext}`,
        }
      }
    }

    return {
      ...result,
      _hookSystemMessage: systemMessage,
    } as SessionEvent & { _hookSystemMessage?: string }
  }

  /**
   * Continue conversation after tool execution
   * This handles the agentic loop - getting assistant response after tool results
   */
  private async *continueConversation(
    abortSignal: AbortSignal
  ): AsyncGenerator<SessionEvent, void, unknown> {
    // Build request with updated messages (including tool results)
    // Max turns guard
    if (this.maxTurns !== undefined) {
      const assistantCount = this._state.messages.filter((m) => m.role === "assistant").length
      if (assistantCount >= this.maxTurns) {
        yield {
          type: "stop",
          stop_reason: "max_turns",
          usage: this._state.usage,
        }
        return
      }
    }

    const request = await this.buildRequest()

    // Get streaming response from provider
    const stream = await this.provider.stream(request, {})

    // Collect response content
    const content: ContentBlock[] = []
    let currentText = ""
    let currentToolUse: { id: string; name: string; input: string } | null = null
    let stopReason = "end_turn"
    let usage: ExtendedUsageInfo = { input_tokens: 0, output_tokens: 0 }

    for await (const event of stream) {
      if (abortSignal.aborted) {
        break
      }

      if (event.type === "content_block_start") {
        if (event.content_block.type === "text") {
          currentText = ""
        } else if (event.content_block.type === "tool_use") {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: "",
          }
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta" && event.delta.text) {
          currentText += event.delta.text
          yield { type: "text", text: event.delta.text }
        } else if (event.delta.type === "input_json_delta" && currentToolUse) {
          currentToolUse.input += event.delta.partial_json || ""
        }
      } else if (event.type === "content_block_stop") {
        if (currentText) {
          content.push({ type: "text", text: currentText })
          currentText = ""
        }
        if (currentToolUse) {
          let parsedInput: Record<string, unknown> = {}
          try {
            parsedInput = JSON.parse(currentToolUse.input || "{}")
          } catch {
            // Ignore parse errors
          }
          yield {
            type: "tool_use",
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: parsedInput,
          }
          content.push({
            type: "tool_use",
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: parsedInput,
          })
          currentToolUse = null
        }
      } else if (event.type === "message_delta") {
        stopReason = event.delta?.stop_reason
        if (event.usage?.output_tokens !== undefined) {
          usage = { ...usage, output_tokens: event.usage.output_tokens }
        }
        if ((event.usage as any)?.input_tokens !== undefined) {
          usage = { ...usage, input_tokens: (event.usage as any).input_tokens }
        }
      } else if (event.type === "message_start") {
        if (event.message?.usage?.input_tokens !== undefined) {
          usage = { ...usage, input_tokens: event.message.usage.input_tokens }
        }
      }
    }

    // Flush any unterminated blocks (provider-agnostic safety)
    if (currentText) {
      content.push({ type: "text", text: currentText })
      currentText = ""
    }
    if (currentToolUse) {
      let parsedInput: Record<string, unknown> = {}
      try {
        parsedInput = JSON.parse(currentToolUse.input || "{}")
      } catch {
        // Ignore parse errors
      }
      yield {
        type: "tool_use",
        id: currentToolUse.id,
        name: currentToolUse.name,
        input: parsedInput,
      }
      content.push({
        type: "tool_use",
        id: currentToolUse.id,
        name: currentToolUse.name,
        input: parsedInput,
      })
      currentToolUse = null
    }

    // Create assistant message
    const assistantMessage: SDKMessage = {
      id: generateMessageId(),
      role: "assistant",
      content,
      stop_reason: stopReason as any,
      usage,
    }

    // Add to history
    this._state.messages.push(assistantMessage)

    // Update usage
    this._state.usage = {
      input_tokens: this._state.usage.input_tokens + usage.input_tokens,
      output_tokens: this._state.usage.output_tokens + usage.output_tokens,
    }
    this._state.updatedAt = Date.now()

    // Yield message event
    yield { type: "message", message: assistantMessage }

    // Handle more tool calls if any
    const toolUseBlocks = content.filter((b) => b.type === "tool_use")
    if (toolUseBlocks.length > 0) {
      const toolResults: ContentBlock[] = []

      for (const block of toolUseBlocks) {
        if (block.type === "tool_use") {
          const toolResult = await this.executeToolCall(block, abortSignal)
          yield toolResult

          if (toolResult.type === "tool_result") {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: typeof toolResult.content === "string" ? toolResult.content : "",
              is_error: toolResult.is_error,
            })
          }
        }
      }

      // Add user message with tool results
      const toolResultMessage: SDKMessage = {
        id: generateMessageId(),
        role: "user",
        content: toolResults,
      }
      this._state.messages.push(toolResultMessage)

      // Recursively continue
      for await (const event of this.continueConversation(abortSignal)) {
        yield event
      }
    } else {
      // No more tool calls - done
      yield {
        type: "stop",
        stop_reason: stopReason,
        usage: this._state.usage,
      }
    }
  }

  /**
   * Combine multiple abort signals
   */
  private combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController()

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort()
        break
      }
      signal.addEventListener("abort", () => controller.abort(), { once: true })
    }

    return controller.signal
  }

  private applyAllowedToolsFilter(): void {
    const spec = this.config.allowedTools
    if (!spec) return

    const patternsFromList = (list?: string[]) => (list ?? []).map((p) => p.trim()).filter(Boolean)

    const wildcardToRegex = (pattern: string) => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
      return new RegExp(`^${escaped}$`)
    }

    const matchesAny = (name: string, patterns: string[]) => patterns.some((p) => wildcardToRegex(p).test(name))

    let allow: string[] | null = null
    let deny: string[] = []

    if (Array.isArray(spec)) {
      allow = patternsFromList(spec)
    } else {
      allow = spec.allow ? patternsFromList(spec.allow) : null
      deny = patternsFromList(spec.deny)
    }

    for (const name of Array.from(this.tools.keys())) {
      if (deny.length && matchesAny(name, deny)) {
        this.tools.delete(name)
        continue
      }
      if (allow && allow.length && !matchesAny(name, allow)) {
        this.tools.delete(name)
      }
    }
  }

  private async buildSystemPrompt(toolNames: string[]): Promise<string | undefined> {
    if (typeof this.config.systemPrompt === "string") {
      return this.config.systemPrompt
    }

    if (!this.config.systemPrompt) {
      return undefined
    }

    const cwd = this.config.cwd ?? process.cwd()
    const built = await defaultSystemPromptBuilder.build(this.config.systemPrompt, {
      cwd,
      toolNames,
      timestamp: Date.now(),
      environment: {
        platform: process.platform,
        shell: process.env.SHELL,
      },
    })

    if (!this.config.systemPrompt.settingSources) {
      return built || undefined
    }

    const contents = await defaultClaudeMdLoader.loadAll(this.config.systemPrompt.settingSources, cwd)
    const merged = defaultClaudeMdLoader.merge(contents).trim()
    const parts = [built?.trim(), merged].filter((p) => p && p.length > 0) as string[]
    return parts.length ? parts.join("\n\n") : undefined
  }
}

/**
 * Create a new session
 */
export function createSessionImpl(
  config: SessionConfig,
  provider: LLMProvider,
  state?: Partial<SessionState>
): Session {
  const id = state?.id ?? generateSessionId()
  return new SessionImpl(id, config, provider, state)
}
