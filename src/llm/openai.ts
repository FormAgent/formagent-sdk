/**
 * OpenAI API provider implementation
 * @module formagent-sdk/llm/openai
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  StreamOptions,
  OpenAIRequest,
  OpenAIResponse,
} from "../types/provider"
import type {
  StreamEvent,
  ContentBlock,
  StopReason,
} from "../types/core"
import type { ToolDefinition } from "../types/tool"

type OpenAIResponsesInputItem =
  | { role: "system" | "developer"; content: string }
  | { role: "user"; content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> }
  | { role: "assistant"; content: Array<{ type: "output_text"; text: string }>; id?: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string; id?: string }
  | { type: "function_call_output"; call_id: string; output: string }

interface OpenAIResponsesRequest {
  model: string
  input: OpenAIResponsesInputItem[]
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  stream?: boolean
  tools?: Array<{
    type: "function"
    name: string
    description?: string
    parameters: Record<string, unknown>
  }>
}

interface OpenAIResponsesResponse {
  id: string
  model: string
  output: Array<{
    type: string
    id?: string
    call_id?: string
    name?: string
    arguments?: string
    content?: Array<{ type: "output_text"; text: string }>
  }>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * OpenAI provider configuration
 */
export interface OpenAICompatibleConfig {
  /** API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string
  /** API base URL (defaults to OPENAI_BASE_URL env var or https://api.openai.com/v1) */
  baseUrl?: string
  /** Organization ID */
  organization?: string
  /** Default max tokens */
  defaultMaxTokens?: number
}

/**
 * OpenAI API provider
 *
 * Implements the LLMProvider interface for OpenAI's models.
 * Also compatible with OpenAI-compatible APIs (Azure, local LLMs, etc.)
 * Automatically reads API key from OPENAI_API_KEY environment variable.
 *
 * @example
 * ```ts
 * // API key from environment variable
 * const provider = new OpenAIProvider()
 *
 * // Or explicit API key
 * const provider = new OpenAIProvider({
 *   apiKey: "your-api-key",
 * })
 * ```
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = "openai"
  readonly name = "OpenAI"
  readonly supportedModels = [
    /^gpt-4/,
    /^gpt-3\.5/,
    /^o1/,
    /^chatgpt/,
  ]

  private config: Required<Pick<OpenAICompatibleConfig, "apiKey" | "baseUrl" | "defaultMaxTokens">> & Pick<OpenAICompatibleConfig, "organization">

  constructor(config: OpenAICompatibleConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config."
      )
    }

    this.config = {
      apiKey,
      baseUrl: this.normalizeBaseUrl(
        config.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
      ),
      organization: config.organization,
      defaultMaxTokens: config.defaultMaxTokens ?? 4096,
    }
  }

  supportsModel(model: string): boolean {
    return this.supportedModels.some((pattern) => pattern.test(model))
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.usesResponsesApi(request.config.model)) {
      const openaiRequest = this.buildResponsesRequest(request, false)

      const response = await fetch(`${this.config.baseUrl}/responses`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(openaiRequest),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${response.status} ${error}`)
      }

      const data = (await response.json()) as OpenAIResponsesResponse
      return this.convertResponsesResponse(data)
    }

    const openaiRequest = this.buildRequest(request, false)

    let response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(openaiRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      if (this.shouldFallbackToResponses(response.status, error)) {
        const fallbackRequest = this.buildResponsesRequest(request, false)
        response = await fetch(`${this.config.baseUrl}/responses`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(fallbackRequest),
          signal: request.abortSignal,
        })

        if (!response.ok) {
          const fallbackError = await response.text()
          throw new Error(`OpenAI API error: ${response.status} ${fallbackError}`)
        }

        const data = (await response.json()) as OpenAIResponsesResponse
        return this.convertResponsesResponse(data)
      }

      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as OpenAIResponse

    return this.convertResponse(data)
  }

  async stream(request: LLMRequest, options?: StreamOptions): Promise<LLMStreamResponse> {
    if (this.usesResponsesApi(request.config.model)) {
      const openaiRequest = this.buildResponsesRequest(request, true)

      const response = await fetch(`${this.config.baseUrl}/responses`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(openaiRequest),
        signal: request.abortSignal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${response.status} ${error}`)
      }

      return this.createResponsesStreamIterator(response.body!, options)
    }

    const openaiRequest = this.buildRequest(request, true)

    let response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(openaiRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      if (this.shouldFallbackToResponses(response.status, error)) {
        const fallbackRequest = this.buildResponsesRequest(request, true)
        response = await fetch(`${this.config.baseUrl}/responses`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(fallbackRequest),
          signal: request.abortSignal,
        })

        if (!response.ok) {
          const fallbackError = await response.text()
          throw new Error(`OpenAI API error: ${response.status} ${fallbackError}`)
        }

        return this.createResponsesStreamIterator(response.body!, options)
      }

      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    return this.createStreamIterator(response.body!, options)
  }

  /**
   * Build OpenAI API request
   */
  private buildRequest(request: LLMRequest, stream: boolean): OpenAIRequest {
    // Convert messages
    const messages = this.convertMessages(request.messages, request.systemPrompt)

    // Convert tools
    const tools = request.tools ? this.convertTools(request.tools) : undefined

    const maxTokens = request.config.maxTokens ?? this.config.defaultMaxTokens!
    const openaiRequest: OpenAIRequest = {
      model: request.config.model,
      messages,
      temperature: request.config.temperature,
      top_p: request.config.topP,
      stop: request.config.stopSequences,
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
      tools,
    }

    if (this.usesMaxCompletionTokens(request.config.model)) {
      openaiRequest.max_completion_tokens = maxTokens
    } else {
      openaiRequest.max_tokens = maxTokens
    }

    return openaiRequest
  }

  private buildResponsesRequest(request: LLMRequest, stream: boolean): OpenAIResponsesRequest {
    const input = this.convertResponsesInput(request.messages, request.systemPrompt)
    const tools = request.tools ? this.convertResponsesTools(request.tools) : undefined

    return {
      model: request.config.model,
      input,
      max_output_tokens: request.config.maxTokens ?? this.config.defaultMaxTokens!,
      temperature: request.config.temperature,
      top_p: request.config.topP,
      stop: request.config.stopSequences,
      stream,
      tools,
    }
  }

  private usesMaxCompletionTokens(model: string): boolean {
    return /^gpt-5/.test(model) || /^o1/.test(model)
  }

  private usesResponsesApi(model: string): boolean {
    return /^gpt-5/.test(model) || /^o1/.test(model)
  }

  private shouldFallbackToResponses(status: number, errorText: string): boolean {
    if (status !== 404) {
      return false
    }
    const normalized = errorText.toLowerCase()
    return normalized.includes("/chat/completions") && normalized.includes("not found")
  }

  private convertResponsesInput(
    messages: LLMRequest["messages"],
    systemPrompt?: string
  ): OpenAIResponsesInputItem[] {
    const input: OpenAIResponsesInputItem[] = []

    if (systemPrompt) {
      input.push({ role: "system", content: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        input.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : "",
        })
        continue
      }

      if (typeof msg.content === "string") {
        if (msg.role === "user") {
          input.push({
            role: "user",
            content: [{ type: "input_text", text: msg.content }],
          })
        } else {
          input.push({
            role: "assistant",
            content: [{ type: "output_text", text: msg.content }],
          })
        }
        continue
      }

      const userContent: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = []
      const assistantContent: Array<{ type: "output_text"; text: string }> = []

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text") {
          if (msg.role === "user") {
            userContent.push({ type: "input_text", text: block.text })
          } else if (msg.role === "assistant") {
            assistantContent.push({ type: "output_text", text: block.text })
          }
        } else if (block.type === "image" && msg.role === "user") {
          if (block.source.type === "base64") {
            userContent.push({
              type: "input_image",
              image_url: `data:${block.source.media_type};base64,${block.source.data}`,
            })
          } else if (block.source.type === "url") {
            userContent.push({
              type: "input_image",
              image_url: block.source.url!,
            })
          }
        } else if (block.type === "tool_use") {
          input.push({
            type: "function_call",
            call_id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          })
        } else if (block.type === "tool_result") {
          input.push({
            type: "function_call_output",
            call_id: block.tool_use_id,
            output: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
          })
        }
      }

      if (msg.role === "user" && userContent.length > 0) {
        input.push({ role: "user", content: userContent })
      } else if (msg.role === "assistant" && assistantContent.length > 0) {
        input.push({ role: "assistant", content: assistantContent })
      }
    }

    return input
  }

  private convertResponsesResponse(data: OpenAIResponsesResponse): LLMResponse {
    const content: ContentBlock[] = []

    for (const item of data.output ?? []) {
      if (item.type === "message" && item.content) {
        for (const part of item.content) {
          if (part.type === "output_text") {
            content.push({ type: "text", text: part.text })
          }
        }
      } else if (item.type === "function_call" && item.call_id && item.name) {
        content.push({
          type: "tool_use",
          id: item.call_id,
          name: item.name,
          input: item.arguments ? JSON.parse(item.arguments) : {},
        })
      }
    }

    return {
      id: data.id,
      model: data.model,
      content,
      stopReason: "end_turn",
      stopSequence: null,
      usage: {
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
      },
    }
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, "")
    try {
      const url = new URL(trimmed)
      const path = url.pathname.replace(/\/+$/, "")

      if (path === "" || path === "/") {
        url.pathname = "/v1"
        return url.toString().replace(/\/+$/, "")
      }

      if (path.endsWith("/openai")) {
        url.pathname = `${path}/v1`
        return url.toString().replace(/\/+$/, "")
      }

      if (!/\/v\d/.test(path)) {
        url.pathname = `${path}/v1`
        return url.toString().replace(/\/+$/, "")
      }

      return url.toString().replace(/\/+$/, "")
    } catch {
      return trimmed
    }
  }

  /**
   * Convert SDK messages to OpenAI format
   */
  private convertMessages(
    messages: LLMRequest["messages"],
    systemPrompt?: string
  ): OpenAIRequest["messages"] {
    const result: OpenAIRequest["messages"] = []

    // Add system prompt if provided
    if (systemPrompt) {
      result.push({
        role: "system",
        content: systemPrompt,
      })
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : "",
        })
        continue
      }

      if (typeof msg.content === "string") {
        result.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })
        continue
      }

      // Convert content blocks
      const content: OpenAIRequest["messages"][0]["content"] = []
      const toolCalls: OpenAIRequest["messages"][0]["tool_calls"] = []

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text") {
          content.push({ type: "text", text: block.text })
        } else if (block.type === "image") {
          if (block.source.type === "base64") {
            content.push({
              type: "image_url",
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            })
          } else if (block.source.type === "url") {
            content.push({
              type: "image_url",
              image_url: { url: block.source.url! },
            })
          }
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          })
        } else if (block.type === "tool_result") {
          // Tool results are separate messages in OpenAI
          result.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
          })
          continue
        }
      }

      // Add message
      if (content.length > 0 || toolCalls.length > 0) {
        const message: OpenAIRequest["messages"][0] = {
          role: msg.role as "user" | "assistant",
          content: content.length === 1 && content[0].type === "text"
            ? content[0].text!
            : content,
        }

        if (toolCalls.length > 0) {
          message.tool_calls = toolCalls
        }

        result.push(message)
      }
    }

    return result
  }

  /**
   * Convert tool definitions to OpenAI format
   */
  private convertTools(tools: ToolDefinition[]): OpenAIRequest["tools"] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  private convertResponsesTools(tools: ToolDefinition[]): OpenAIResponsesRequest["tools"] {
    return tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }))
  }

  /**
   * Convert OpenAI response to SDK format
   */
  private convertResponse(data: OpenAIResponse): LLMResponse {
    const choice = data.choices[0]
    const content: ContentBlock[] = []

    // Add text content
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content })
    }

    // Add tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        })
      }
    }

    return {
      id: data.id,
      model: data.model,
      content,
      stopReason: this.convertStopReason(choice.finish_reason),
      stopSequence: null,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    }
  }

  /**
   * Convert OpenAI stop reason to SDK format
   */
  private convertStopReason(reason: string): StopReason {
    switch (reason) {
      case "stop":
        return "end_turn"
      case "length":
        return "max_tokens"
      case "tool_calls":
        return "tool_use"
      case "content_filter":
        return "stop_sequence"
      default:
        return "end_turn"
    }
  }

  /**
   * Create stream iterator from SSE response
   */
  private createStreamIterator(
    body: ReadableStream<Uint8Array>,
    options?: StreamOptions
  ): LLMStreamResponse {
    const self = this

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
        const reader = body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        // Track tool call accumulation
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()
        let emittedMessageStart = false
        let textBlockStarted = false
        let finished = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim()
                if (!data) continue
                if (data === "[DONE]") {
                  if (!finished) {
                    const stopEvent: StreamEvent = { type: "message_stop" }
                    options?.onEvent?.(stopEvent)
                    yield stopEvent
                  }
                  finished = true
                  continue
                }

                try {
                  const json = JSON.parse(data)
                  const delta = json.choices?.[0]?.delta
                  const finishReason = json.choices?.[0]?.finish_reason

                  if (!emittedMessageStart) {
                    emittedMessageStart = true
                    const startEvent: StreamEvent = {
                      type: "message_start",
                      message: {
                        id: json.id ?? "",
                        type: "message",
                        role: "assistant",
                        content: [],
                        model: json.model ?? "",
                        stop_reason: null,
                        stop_sequence: null,
                        usage: { input_tokens: 0, output_tokens: 0 },
                      },
                    }
                    options?.onEvent?.(startEvent)
                    yield startEvent
                  }

                  // Handle text content
                  if (delta?.content) {
                    if (!textBlockStarted) {
                      textBlockStarted = true
                      const startText: StreamEvent = {
                        type: "content_block_start",
                        index: 0,
                        content_block: { type: "text", text: "" },
                      }
                      options?.onEvent?.(startText)
                      yield startText
                    }

                    const textEvent: StreamEvent = {
                      type: "content_block_delta",
                      index: 0,
                      delta: {
                        type: "text_delta",
                        text: delta.content,
                      },
                    }
                    options?.onText?.(delta.content)
                    options?.onEvent?.(textEvent)
                    yield textEvent
                  }

                  // Handle tool calls
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const index = tc.index
                      const blockIndex = 1 + index

                      if (!toolCalls.has(index)) {
                        // New tool call
                        toolCalls.set(index, {
                          id: tc.id || "",
                          name: tc.function?.name || "",
                          arguments: tc.function?.arguments || "",
                        })

                        // Start content block
                        const startEvent: StreamEvent = {
                          type: "content_block_start",
                          index: blockIndex,
                          content_block: {
                            type: "tool_use",
                            id: tc.id || "",
                            name: tc.function?.name || "",
                            input: {},
                          },
                        }
                        options?.onEvent?.(startEvent)
                        yield startEvent
                      } else {
                        // Update existing tool call
                        const existing = toolCalls.get(index)!
                        if (tc.id) existing.id = tc.id
                        if (tc.function?.name) existing.name = tc.function.name
                        if (tc.function?.arguments) existing.arguments += tc.function.arguments
                      }

                      // Emit delta
                      if (tc.function?.arguments) {
                        const deltaEvent: StreamEvent = {
                          type: "content_block_delta",
                          index: blockIndex,
                          delta: {
                            type: "input_json_delta",
                            partial_json: tc.function.arguments,
                          },
                        }
                        options?.onEvent?.(deltaEvent)
                        yield deltaEvent
                      }
                    }
                  }

                  // Handle finish
                  if (finishReason) {
                    finished = true

                    if (textBlockStarted) {
                      const stopText: StreamEvent = { type: "content_block_stop", index: 0 }
                      options?.onEvent?.(stopText)
                      yield stopText
                    }

                    // Emit content_block_stop for each tool call
                    for (const [index, tc] of toolCalls) {
                      const stopEvent: StreamEvent = {
                        type: "content_block_stop",
                        index: 1 + index,
                      }
                      options?.onEvent?.(stopEvent)
                      yield stopEvent

                      try {
                        const input = JSON.parse(tc.arguments)
                        options?.onToolUse?.({ id: tc.id, name: tc.name, input })
                      } catch {
                        // Ignore parse errors
                      }
                    }

                    // Message delta with stop reason
                    const messageDelta: StreamEvent = {
                      type: "message_delta",
                      delta: {
                        stop_reason: self.convertStopReason(finishReason),
                        stop_sequence: null,
                      },
                      usage: {
                        output_tokens: json.usage?.completion_tokens ?? 0,
                        input_tokens: json.usage?.prompt_tokens ?? 0,
                      },
                    }
                    options?.onEvent?.(messageDelta)
                    yield messageDelta

                    const stopEvent: StreamEvent = { type: "message_stop" }
                    options?.onEvent?.(stopEvent)
                    yield stopEvent
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      },
    }
  }

  private createResponsesStreamIterator(
    body: ReadableStream<Uint8Array>,
    options?: StreamOptions
  ): LLMStreamResponse {
    const self = this

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
        const reader = body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let emittedMessageStart = false
        let textBlockStarted = false
        let finished = false
        const toolCalls = new Map<
          string,
          { callId: string; name: string; arguments: string; blockIndex: number; done: boolean }
        >()
        let nextToolBlockIndex = 1

        const ensureMessageStart = (id?: string, model?: string) => {
          if (emittedMessageStart) return
          emittedMessageStart = true
          const startEvent: StreamEvent = {
            type: "message_start",
            message: {
              id: id ?? "",
              type: "message",
              role: "assistant",
              content: [],
              model: model ?? "",
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }
          options?.onEvent?.(startEvent)
          return startEvent
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const data = line.slice(6).trim()
              if (!data) continue
              if (data === "[DONE]") {
                if (!finished) {
                  const stopEvent: StreamEvent = { type: "message_stop" }
                  options?.onEvent?.(stopEvent)
                  yield stopEvent
                }
                finished = true
                continue
              }

              let payload: any
              try {
                payload = JSON.parse(data)
              } catch {
                continue
              }

              const type = payload?.type
              if (type === "response.created") {
                const startEvent = ensureMessageStart(payload.response?.id, payload.response?.model)
                if (startEvent) yield startEvent
                continue
              }

              if (!emittedMessageStart) {
                const startEvent = ensureMessageStart(payload?.response?.id, payload?.response?.model)
                if (startEvent) yield startEvent
              }

              if (type === "response.output_text.delta") {
                if (!textBlockStarted) {
                  textBlockStarted = true
                  const startText: StreamEvent = {
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "text", text: "" },
                  }
                  options?.onEvent?.(startText)
                  yield startText
                }

                const textDelta = payload.delta ?? ""
                if (textDelta) {
                  const textEvent: StreamEvent = {
                    type: "content_block_delta",
                    index: 0,
                    delta: { type: "text_delta", text: textDelta },
                  }
                  options?.onText?.(textDelta)
                  options?.onEvent?.(textEvent)
                  yield textEvent
                }
              } else if (type === "response.output_item.added") {
                const item = payload.item
                if (item?.type === "function_call") {
                  const blockIndex = nextToolBlockIndex++
                  const callId = item.call_id ?? item.id ?? ""
                  toolCalls.set(item.id, {
                    callId,
                    name: item.name ?? "",
                    arguments: item.arguments ?? "",
                    blockIndex,
                    done: false,
                  })

                  const startEvent: StreamEvent = {
                    type: "content_block_start",
                    index: blockIndex,
                    content_block: {
                      type: "tool_use",
                      id: callId,
                      name: item.name ?? "",
                      input: {},
                    },
                  }
                  options?.onEvent?.(startEvent)
                  yield startEvent

                  if (item.arguments) {
                    const deltaEvent: StreamEvent = {
                      type: "content_block_delta",
                      index: blockIndex,
                      delta: {
                        type: "input_json_delta",
                        partial_json: item.arguments,
                      },
                    }
                    options?.onEvent?.(deltaEvent)
                    yield deltaEvent
                  }
                }
              } else if (type === "response.function_call_arguments.delta") {
                const entry = toolCalls.get(payload.item_id)
                if (entry && payload.delta) {
                  entry.arguments += payload.delta
                  const deltaEvent: StreamEvent = {
                    type: "content_block_delta",
                    index: entry.blockIndex,
                    delta: { type: "input_json_delta", partial_json: payload.delta },
                  }
                  options?.onEvent?.(deltaEvent)
                  yield deltaEvent
                }
              } else if (type === "response.output_item.done") {
                const item = payload.item
                if (item?.type === "function_call") {
                  const entry = toolCalls.get(item.id)
                  if (entry && !entry.done) {
                    entry.done = true
                    const stopEvent: StreamEvent = {
                      type: "content_block_stop",
                      index: entry.blockIndex,
                    }
                    options?.onEvent?.(stopEvent)
                    yield stopEvent

                    try {
                      const input = entry.arguments ? JSON.parse(entry.arguments) : {}
                      options?.onToolUse?.({ id: entry.callId, name: entry.name, input })
                    } catch {
                      options?.onToolUse?.({ id: entry.callId, name: entry.name, input: {} })
                    }
                  }
                }
              } else if (type === "response.completed" || type === "response.incomplete") {
                finished = true

                if (textBlockStarted) {
                  const stopText: StreamEvent = { type: "content_block_stop", index: 0 }
                  options?.onEvent?.(stopText)
                  yield stopText
                }

                for (const entry of toolCalls.values()) {
                  if (entry.done) continue
                  entry.done = true
                  const stopEvent: StreamEvent = {
                    type: "content_block_stop",
                    index: entry.blockIndex,
                  }
                  options?.onEvent?.(stopEvent)
                  yield stopEvent

                  try {
                    const input = entry.arguments ? JSON.parse(entry.arguments) : {}
                    options?.onToolUse?.({ id: entry.callId, name: entry.name, input })
                  } catch {
                    options?.onToolUse?.({ id: entry.callId, name: entry.name, input: {} })
                  }
                }

                const finishReason = payload.response?.incomplete_details?.reason
                const messageDelta: StreamEvent = {
                  type: "message_delta",
                  delta: {
                    stop_reason: self.convertResponsesStopReason(finishReason),
                    stop_sequence: null,
                  },
                  usage: {
                    output_tokens: payload.response?.usage?.output_tokens ?? 0,
                    input_tokens: payload.response?.usage?.input_tokens ?? 0,
                  },
                }
                options?.onEvent?.(messageDelta)
                yield messageDelta

                const stopEvent: StreamEvent = { type: "message_stop" }
                options?.onEvent?.(stopEvent)
                yield stopEvent
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      },
    }
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
    }

    if (this.config.organization) {
      headers["OpenAI-Organization"] = this.config.organization
    }

    return headers
  }

  private convertResponsesStopReason(reason?: string): StopReason {
    if (reason === "max_output_tokens") {
      return "max_tokens"
    }
    return "end_turn"
  }
}

/**
 * Create an OpenAI provider
 *
 * @param config - Provider configuration
 * @returns OpenAIProvider instance
 */
export function createOpenAIProvider(config: OpenAICompatibleConfig): OpenAIProvider {
  return new OpenAIProvider(config)
}
