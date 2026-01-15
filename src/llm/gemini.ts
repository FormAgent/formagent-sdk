/**
 * Gemini API provider implementation
 * @module formagent-sdk/llm/gemini
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  StreamOptions,
} from "../types/provider"
import type { ContentBlock, StopReason, StreamEvent, UsageInfo } from "../types/core"
import type { ToolDefinition } from "../types/tool"

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } }
  | { functionCall: { name: string; args: Record<string, unknown>; thought_signature?: string } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

interface GeminiContent {
  role: "user" | "model"
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: Array<{ text: string }> }
  generationConfig?: {
    temperature?: number
    topP?: number
    maxOutputTokens?: number
    stopSequences?: string[]
  }
  tools?: Array<{
    functionDeclarations: Array<{
      name: string
      description?: string
      parameters: Record<string, unknown>
    }>
  }>
  toolConfig?: {
    functionCallingConfig: {
      mode: "AUTO"
    }
  }
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  model?: string
}

/**
 * Gemini provider configuration
 */
export interface GeminiProviderConfig {
  /** API key (defaults to GEMINI_API_KEY or GOOGLE_API_KEY env var) */
  apiKey?: string
  /** API base URL (defaults to GEMINI_BASE_URL env var or https://generativelanguage.googleapis.com/v1beta) */
  baseUrl?: string
  /** Default max tokens */
  defaultMaxTokens?: number
}

/**
 * Gemini API provider
 *
 * Implements the LLMProvider interface for Google's Gemini models.
 * Uses the Generative Language API endpoints.
 */
export class GeminiProvider implements LLMProvider {
  readonly id = "gemini"
  readonly name = "Gemini"
  readonly supportedModels = [/^gemini-/, /^models\/gemini-/]

  private config: Required<Pick<GeminiProviderConfig, "apiKey" | "baseUrl" | "defaultMaxTokens">>

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error(
        "Gemini API key is required. Set GEMINI_API_KEY/GOOGLE_API_KEY or pass apiKey in config."
      )
    }

    this.config = {
      apiKey,
      baseUrl: config.baseUrl ?? process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
      defaultMaxTokens: config.defaultMaxTokens ?? 4096,
    }
  }

  supportsModel(model: string): boolean {
    return this.supportedModels.some((pattern) => pattern.test(model))
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const geminiRequest = this.buildRequest(request)
    const url = this.buildUrl(this.getModelPath(request.config.model) + ":generateContent")

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(geminiRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as GeminiResponse
    return this.convertResponse(data, request.config.model)
  }

  async stream(request: LLMRequest, options?: StreamOptions): Promise<LLMStreamResponse> {
    const geminiRequest = this.buildRequest(request)
    const url = this.buildUrl(this.getModelPath(request.config.model) + ":streamGenerateContent", {
      alt: "sse",
    })

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(geminiRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} ${error}`)
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/event-stream")) {
      const data = (await response.json()) as GeminiResponse | GeminiResponse[]
      return this.createResponseIterator(data, options, request.config.model)
    }

    return this.createStreamIterator(response.body!, options, request.config.model)
  }

  private buildRequest(request: LLMRequest): GeminiRequest {
    const { contents, systemInstruction } = this.convertMessages(request.messages, request.systemPrompt)
    const tools = request.tools ? this.convertTools(request.tools) : undefined

    return {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: request.config.temperature,
        topP: request.config.topP,
        maxOutputTokens: request.config.maxTokens ?? this.config.defaultMaxTokens,
        stopSequences: request.config.stopSequences,
      },
      tools,
      toolConfig: tools ? { functionCallingConfig: { mode: "AUTO" } } : undefined,
    }
  }

  private convertMessages(
    messages: LLMRequest["messages"],
    systemPrompt?: string
  ): { contents: GeminiContent[]; systemInstruction?: { parts: Array<{ text: string }> } } {
    const contents: GeminiContent[] = []
    const systemTexts: string[] = []
    const toolNameById = new Map<string, string>()

    for (const msg of messages) {
      if (typeof msg.content !== "string") {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "tool_use") {
            toolNameById.set(block.id, block.name)
          }
        }
      }
    }

    if (systemPrompt) {
      systemTexts.push(systemPrompt)
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        if (typeof msg.content === "string") {
          systemTexts.push(msg.content)
        } else {
          for (const block of msg.content as ContentBlock[]) {
            if (block.type === "text") {
              systemTexts.push(block.text)
            }
          }
        }
        continue
      }

      if (typeof msg.content === "string") {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })
        continue
      }

      const parts: GeminiPart[] = []
      const toolResponses: GeminiPart[] = []

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text") {
          parts.push({ text: block.text })
        } else if (block.type === "image") {
          if (block.source.type === "base64") {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type ?? "image/jpeg",
                data: block.source.data ?? "",
              },
            })
          } else if (block.source.type === "url") {
            parts.push({
              fileData: {
                mimeType: block.source.media_type ?? "image/jpeg",
                fileUri: block.source.url ?? "",
              },
            })
          }
        } else if (block.type === "tool_result") {
          const toolName = toolNameById.get(block.tool_use_id) ?? "tool"
          const output =
            typeof block.content === "string"
              ? block.content
            : JSON.stringify(block.content)
          toolResponses.push({
            functionResponse: {
              name: toolName,
              response: { output },
            },
          })
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts,
        })
      }

      if (toolResponses.length > 0) {
        contents.push({
          role: "user",
          parts: toolResponses,
        })
      }
    }

    const systemInstruction = systemTexts.length > 0
      ? { parts: [{ text: systemTexts.join("\n\n") }] }
      : undefined

    return { contents, systemInstruction }
  }

  private convertTools(tools: ToolDefinition[]): GeminiRequest["tools"] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: this.sanitizeSchema(tool.inputSchema),
        })),
      },
    ]
  }

  private sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const visited = new WeakMap<object, Record<string, unknown>>()

    const scrub = (value: unknown): unknown => {
      if (value === null || typeof value !== "object") {
        return value
      }
      if (Array.isArray(value)) {
        return value.map((item) => scrub(item))
      }

      const existing = visited.get(value as object)
      if (existing) {
        return existing
      }

      const result: Record<string, unknown> = {}
      visited.set(value as object, result)

      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (key === "additionalProperties") {
          continue
        }
        result[key] = scrub(inner)
      }
      return result
    }

    return scrub(schema) as Record<string, unknown>
  }

  private convertResponse(data: GeminiResponse, model: string): LLMResponse {
    const candidate = data.candidates?.[0]
    const content: ContentBlock[] = []
    const parts = candidate?.content?.parts ?? []

    let toolIndex = 0
    for (const part of parts) {
      if ("text" in part && part.text) {
        content.push({ type: "text", text: part.text })
      } else if ("functionCall" in part && part.functionCall) {
        const callId = `${part.functionCall.name}_${toolIndex++}`
        content.push({
          type: "tool_use",
          id: callId,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        })
      }
    }

    return {
      id: "",
      model: data.model ?? model,
      content,
      stopReason: this.convertStopReason(candidate?.finishReason),
      stopSequence: null,
      usage: this.convertUsage(data.usageMetadata),
    }
  }

  private convertUsage(usage?: GeminiResponse["usageMetadata"]): UsageInfo {
    return {
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
    }
  }

  private convertStopReason(reason?: string): StopReason {
    switch (reason) {
      case "MAX_TOKENS":
        return "max_tokens"
      case "STOP":
        return "end_turn"
      default:
        return "end_turn"
    }
  }

  private createStreamIterator(
    body: ReadableStream<Uint8Array>,
    options: StreamOptions | undefined,
    model: string
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
        let toolIndex = 0
        let emittedAny = false

        const emitMessageStart = (modelId: string) => {
          if (emittedMessageStart) return
          emittedMessageStart = true
          const startEvent: StreamEvent = {
            type: "message_start",
            message: {
              id: "",
              type: "message",
              role: "assistant",
              content: [],
              model: modelId,
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
              const trimmed = line.trim()
              if (!trimmed) continue

              let jsonText = trimmed
              if (trimmed.startsWith("data:")) {
                jsonText = trimmed.slice(5).trim()
              }

              let payload: GeminiResponse | undefined
              try {
                payload = JSON.parse(jsonText) as GeminiResponse
              } catch {
                continue
              }

              const startEvent = emitMessageStart(payload.model ?? model)
              if (startEvent) {
                yield startEvent
                emittedAny = true
              }

              const candidate = payload.candidates?.[0]
              const parts = candidate?.content?.parts ?? []

              for (const part of parts) {
                if ("text" in part && part.text) {
                  if (!textBlockStarted) {
                    textBlockStarted = true
                    const startText: StreamEvent = {
                      type: "content_block_start",
                      index: 0,
                      content_block: { type: "text", text: "" },
                    }
                    options?.onEvent?.(startText)
                    yield startText
                    emittedAny = true
                  }

                  const textEvent: StreamEvent = {
                    type: "content_block_delta",
                    index: 0,
                    delta: { type: "text_delta", text: part.text },
                  }
                  options?.onText?.(part.text)
                  options?.onEvent?.(textEvent)
                  yield textEvent
                  emittedAny = true
                } else if ("functionCall" in part && part.functionCall) {
                  const callId = `${part.functionCall.name}_${toolIndex}`
                  const blockIndex = 1 + toolIndex
                  toolIndex += 1

                  const startTool: StreamEvent = {
                    type: "content_block_start",
                    index: blockIndex,
                    content_block: {
                      type: "tool_use",
                      id: callId,
                      name: part.functionCall.name,
                      input: {},
                    },
                  }
                  options?.onEvent?.(startTool)
                  yield startTool
                  emittedAny = true

                  const args = JSON.stringify(part.functionCall.args ?? {})
                  if (args) {
                    const deltaEvent: StreamEvent = {
                      type: "content_block_delta",
                      index: blockIndex,
                      delta: { type: "input_json_delta", partial_json: args },
                    }
                    options?.onEvent?.(deltaEvent)
                    yield deltaEvent
                    emittedAny = true
                  }

                  const stopTool: StreamEvent = {
                    type: "content_block_stop",
                    index: blockIndex,
                  }
                  options?.onEvent?.(stopTool)
                  yield stopTool
                  emittedAny = true

                  options?.onToolUse?.({
                    id: callId,
                    name: part.functionCall.name,
                    input: part.functionCall.args ?? {},
                  })
                  emittedAny = true
                }
              }

              if (candidate?.finishReason && !finished) {
                finished = true

                if (textBlockStarted) {
                  const stopText: StreamEvent = { type: "content_block_stop", index: 0 }
                  options?.onEvent?.(stopText)
                  yield stopText
                }

                const messageDelta: StreamEvent = {
                  type: "message_delta",
                  delta: {
                    stop_reason: self.convertStopReason(candidate.finishReason),
                    stop_sequence: null,
                  },
                  usage: self.convertUsage(payload.usageMetadata),
                }
                options?.onEvent?.(messageDelta)
                yield messageDelta
                emittedAny = true

                const stopEvent: StreamEvent = { type: "message_stop" }
                options?.onEvent?.(stopEvent)
                yield stopEvent
                emittedAny = true
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        if (!emittedAny) {
          const trimmed = buffer.trim()
          if (trimmed) {
            try {
              const parsed = JSON.parse(trimmed) as GeminiResponse | GeminiResponse[]
              const responses = Array.isArray(parsed) ? parsed : [parsed]
              for (const payload of responses) {
                const startEvent = emitMessageStart(payload.model ?? model)
                if (startEvent) {
                  yield startEvent
                }

                const candidate = payload.candidates?.[0]
                const parts = candidate?.content?.parts ?? []

                for (const part of parts) {
                  if ("text" in part && part.text) {
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
                      delta: { type: "text_delta", text: part.text },
                    }
                    options?.onText?.(part.text)
                    options?.onEvent?.(textEvent)
                    yield textEvent
                  }
                }

                if (textBlockStarted) {
                  const stopText: StreamEvent = { type: "content_block_stop", index: 0 }
                  options?.onEvent?.(stopText)
                  yield stopText
                }

                const messageDelta: StreamEvent = {
                  type: "message_delta",
                  delta: {
                    stop_reason: self.convertStopReason(candidate?.finishReason),
                    stop_sequence: null,
                  },
                  usage: self.convertUsage(payload.usageMetadata),
                }
                options?.onEvent?.(messageDelta)
                yield messageDelta

                const stopEvent: StreamEvent = { type: "message_stop" }
                options?.onEvent?.(stopEvent)
                yield stopEvent
              }
              return
            } catch {
              // fall through to default stop
            }
          }
        }

        if (!finished) {
          if (textBlockStarted) {
            const stopText: StreamEvent = { type: "content_block_stop", index: 0 }
            options?.onEvent?.(stopText)
            yield stopText
          }
          const stopEvent: StreamEvent = { type: "message_stop" }
          options?.onEvent?.(stopEvent)
          yield stopEvent
        }
      },
    }
  }

  private createResponseIterator(
    data: GeminiResponse | GeminiResponse[],
    options: StreamOptions | undefined,
    model: string
  ): LLMStreamResponse {
    const responses = Array.isArray(data) ? data : [data]
    const self = this

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
        for (const payload of responses) {
          const candidate = payload.candidates?.[0]
          const parts = candidate?.content?.parts ?? []
          let textIndex = 0
          let toolIndex = 0

          const startEvent: StreamEvent = {
            type: "message_start",
            message: {
              id: "",
              type: "message",
              role: "assistant",
              content: [],
              model: payload.model ?? model,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }
          options?.onEvent?.(startEvent)
          yield startEvent

          for (const part of parts) {
            if ("text" in part && part.text) {
              const startText: StreamEvent = {
                type: "content_block_start",
                index: textIndex,
                content_block: { type: "text", text: "" },
              }
              options?.onEvent?.(startText)
              yield startText

              const textEvent: StreamEvent = {
                type: "content_block_delta",
                index: textIndex,
                delta: { type: "text_delta", text: part.text },
              }
              options?.onText?.(part.text)
              options?.onEvent?.(textEvent)
              yield textEvent

              const stopText: StreamEvent = { type: "content_block_stop", index: textIndex }
              options?.onEvent?.(stopText)
              yield stopText

              textIndex += 1
            } else if ("functionCall" in part && part.functionCall) {
              const callId = `${part.functionCall.name}_${toolIndex}`
              const blockIndex = textIndex + toolIndex + 1
              toolIndex += 1

              const startTool: StreamEvent = {
                type: "content_block_start",
                index: blockIndex,
                content_block: {
                  type: "tool_use",
                  id: callId,
                  name: part.functionCall.name,
                  input: {},
                },
              }
              options?.onEvent?.(startTool)
              yield startTool

              const args = JSON.stringify(part.functionCall.args ?? {})
              if (args) {
                const deltaEvent: StreamEvent = {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: { type: "input_json_delta", partial_json: args },
                }
                options?.onEvent?.(deltaEvent)
                yield deltaEvent
              }

              const stopTool: StreamEvent = { type: "content_block_stop", index: blockIndex }
              options?.onEvent?.(stopTool)
              yield stopTool

              options?.onToolUse?.({
                id: callId,
                name: part.functionCall.name,
                input: part.functionCall.args ?? {},
              })
            }
          }

          const messageDelta: StreamEvent = {
            type: "message_delta",
            delta: {
              stop_reason: self.convertStopReason(candidate?.finishReason),
              stop_sequence: null,
            },
            usage: self.convertUsage(payload.usageMetadata),
          }
          options?.onEvent?.(messageDelta)
          yield messageDelta

          const stopEvent: StreamEvent = { type: "message_stop" }
          options?.onEvent?.(stopEvent)
          yield stopEvent
        }
      },
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.config.apiKey,
    }
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\/+$/, "")
    const url = new URL(`${base}/${path.replace(/^\/+/, "")}`)
    if (!url.searchParams.has("key")) {
      url.searchParams.set("key", this.config.apiKey)
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }

  private getModelPath(model: string): string {
    return model.startsWith("models/") ? model : `models/${model}`
  }
}

/**
 * Create a Gemini provider
 *
 * @param config - Provider configuration
 * @returns GeminiProvider instance
 */
export function createGeminiProvider(config: GeminiProviderConfig): GeminiProvider {
  return new GeminiProvider(config)
}
