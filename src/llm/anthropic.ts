/**
 * Anthropic API provider implementation
 * @module formagent-sdk/llm/anthropic
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  StreamOptions,
  AnthropicRequest,
  AnthropicResponse,
} from "../types/provider"
import type {
  StreamEvent,
  ContentBlock,
  UsageInfo,
  StopReason,
} from "../types/core"
import type { ToolDefinition } from "../types/tool"

/**
 * Anthropic provider configuration
 */
export interface AnthropicProviderConfig {
  /** API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string
  /** API base URL (defaults to ANTHROPIC_BASE_URL env var or https://api.anthropic.com) */
  baseUrl?: string
  /** API version header */
  apiVersion?: string
  /** Default max tokens */
  defaultMaxTokens?: number
}

/**
 * Anthropic API provider
 *
 * Implements the LLMProvider interface for Anthropic's Claude models.
 * Automatically reads API key from ANTHROPIC_API_KEY environment variable.
 *
 * @example
 * ```ts
 * // API key from environment variable
 * const provider = new AnthropicProvider()
 *
 * // Or explicit API key
 * const provider = new AnthropicProvider({
 *   apiKey: "your-api-key",
 * })
 * ```
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic"
  readonly name = "Anthropic"
  readonly supportedModels = [
    /^claude-sonnet-4/,
    /^claude-opus-4/,
    /^claude-3/,
    /^claude-2/,
    /^claude-instant/,
  ]

  private config: Required<Pick<AnthropicProviderConfig, "apiKey" | "baseUrl" | "apiVersion" | "defaultMaxTokens">>

  constructor(config: AnthropicProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        "Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config."
      )
    }

    this.config = {
      apiKey,
      baseUrl: config.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
      apiVersion: config.apiVersion ?? "2023-06-01",
      defaultMaxTokens: config.defaultMaxTokens ?? 4096,
    }
  }

  supportsModel(model: string): boolean {
    return this.supportedModels.some((pattern) => pattern.test(model))
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const anthropicRequest = this.buildRequest(request, false)

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(anthropicRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as AnthropicResponse

    return this.convertResponse(data)
  }

  async stream(request: LLMRequest, options?: StreamOptions): Promise<LLMStreamResponse> {
    const anthropicRequest = this.buildRequest(request, true)

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(anthropicRequest),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${error}`)
    }

    return this.createStreamIterator(response.body!, options)
  }

  /**
   * Build Anthropic API request
   */
  private buildRequest(request: LLMRequest, stream: boolean): AnthropicRequest {
    // Convert messages
    const messages = this.convertMessages(request.messages)

    // Convert tools
    const tools = request.tools ? this.convertTools(request.tools) : undefined

    return {
      model: request.config.model,
      messages,
      system: request.systemPrompt,
      max_tokens: request.config.maxTokens ?? this.config.defaultMaxTokens!,
      temperature: request.config.temperature,
      top_p: request.config.topP,
      top_k: request.config.topK,
      stop_sequences: request.config.stopSequences,
      stream,
      tools,
    }
  }

  /**
   * Convert SDK messages to Anthropic format
   */
  private convertMessages(messages: LLMRequest["messages"]): AnthropicRequest["messages"] {
    return messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => {
        if (typeof msg.content === "string") {
          return {
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }
        }

        // Convert content blocks
        const content: AnthropicRequest["messages"][0]["content"] = []

        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text })
          } else if (block.type === "image") {
            if (block.source.type === "base64") {
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: block.source.media_type!,
                  data: block.source.data!,
                },
              })
            }
          } else if (block.type === "tool_use") {
            content.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            })
          } else if (block.type === "tool_result") {
            content.push({
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content: typeof block.content === "string" ? block.content : undefined,
              is_error: block.is_error,
            })
          }
        }

        return {
          role: msg.role as "user" | "assistant",
          content,
        }
      })
  }

  /**
   * Convert tool definitions to Anthropic format
   */
  private convertTools(tools: ToolDefinition[]): AnthropicRequest["tools"] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }))
  }

  /**
   * Convert Anthropic response to SDK format
   */
  private convertResponse(data: AnthropicResponse): LLMResponse {
    const content: ContentBlock[] = data.content.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text! }
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id!,
          name: block.name!,
          input: block.input!,
        }
      }
      return { type: "text", text: "" }
    })

    return {
      id: data.id,
      model: data.model,
      content,
      stopReason: data.stop_reason as StopReason,
      stopSequence: data.stop_sequence,
      usage: {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
        cache_creation_input_tokens: data.usage.cache_creation_input_tokens,
        cache_read_input_tokens: data.usage.cache_read_input_tokens,
      },
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
                if (!data || data === "[DONE]") continue

                try {
                  const event = JSON.parse(data)
                  const streamEvent = self.parseStreamEvent(event)

                  if (streamEvent) {
                    // Call callbacks
                    if (streamEvent.type === "content_block_delta" && streamEvent.delta.type === "text_delta") {
                      options?.onText?.(streamEvent.delta.text!)
                    }

                    options?.onEvent?.(streamEvent)
                    yield streamEvent
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

  /**
   * Parse SSE event to StreamEvent
   */
  private parseStreamEvent(event: any): StreamEvent | null {
    switch (event.type) {
      case "message_start":
        return {
          type: "message_start",
          message: {
            id: event.message.id,
            type: "message",
            role: "assistant",
            content: [],
            model: event.message.model,
            stop_reason: null,
            stop_sequence: null,
            usage: event.message.usage,
          },
        }

      case "content_block_start":
        return {
          type: "content_block_start",
          index: event.index,
          content_block: event.content_block,
        }

      case "content_block_delta":
        return {
          type: "content_block_delta",
          index: event.index,
          delta: event.delta,
        }

      case "content_block_stop":
        return {
          type: "content_block_stop",
          index: event.index,
        }

      case "message_delta":
        return {
          type: "message_delta",
          delta: {
            stop_reason: event.delta.stop_reason,
            stop_sequence: event.delta.stop_sequence,
          },
          usage: {
            output_tokens: event.usage.output_tokens,
          },
        }

      case "message_stop":
        return {
          type: "message_stop",
        }

      case "error":
        return {
          type: "error",
          error: {
            type: event.error.type,
            message: event.error.message,
          },
        }

      default:
        return null
    }
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "anthropic-version": this.config.apiVersion,
    }
  }
}

/**
 * Create an Anthropic provider
 *
 * @param config - Provider configuration
 * @returns AnthropicProvider instance
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): AnthropicProvider {
  return new AnthropicProvider(config)
}
