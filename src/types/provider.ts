/**
 * LLM Provider type definitions
 * @module formagent-sdk/types/provider
 */

import type {
  SDKMessage,
  UsageInfo,
  ModelConfig,
  StreamEvent,
  StopReason,
  ContentBlock,
} from "./core"
import type { ToolDefinition } from "./tool"

// === Provider Request Types ===

/**
 * Request to LLM provider
 */
export interface LLMRequest {
  /** Messages to send */
  messages: SDKMessage[]
  /** Available tools */
  tools?: ToolDefinition[]
  /** Model configuration */
  config: ModelConfig
  /** System prompt (if not in messages) */
  systemPrompt?: string
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * Streaming request options
 */
export interface StreamOptions {
  /** Callback for each event */
  onEvent?: (event: StreamEvent) => void | Promise<void>
  /** Callback for text chunks */
  onText?: (text: string) => void | Promise<void>
  /** Callback for tool use */
  onToolUse?: (toolUse: { id: string; name: string; input: Record<string, unknown> }) => void | Promise<void>
}

// === Provider Response Types ===

/**
 * Non-streaming response from LLM provider
 */
export interface LLMResponse {
  /** Response ID */
  id: string
  /** Model used */
  model: string
  /** Response content blocks */
  content: ContentBlock[]
  /** Stop reason */
  stopReason: StopReason
  /** Stop sequence (if applicable) */
  stopSequence?: string | null
  /** Usage information */
  usage: UsageInfo
}

/**
 * Streaming response from LLM provider
 */
export interface LLMStreamResponse {
  /** Async iterator of stream events */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent>
}

// === Provider Interface ===

/**
 * LLM provider interface
 */
export interface LLMProvider {
  /** Provider identifier */
  readonly id: string
  /** Provider display name */
  readonly name: string
  /** Supported model patterns (regex) */
  readonly supportedModels: RegExp[]

  /**
   * Check if this provider supports a model
   * @param model - Model identifier
   */
  supportsModel(model: string): boolean

  /**
   * Send a non-streaming request
   * @param request - LLM request
   */
  complete(request: LLMRequest): Promise<LLMResponse>

  /**
   * Send a streaming request
   * @param request - LLM request
   * @param options - Stream options
   */
  stream(request: LLMRequest, options?: StreamOptions): Promise<LLMStreamResponse>
}

// === Provider Registry Types ===

/**
 * Provider registry interface
 */
export interface ProviderRegistry {
  /**
   * Register a provider
   * @param provider - Provider to register
   */
  register(provider: LLMProvider): void

  /**
   * Unregister a provider
   * @param providerId - Provider ID to unregister
   */
  unregister(providerId: string): void

  /**
   * Get a provider by ID
   * @param providerId - Provider ID
   */
  get(providerId: string): LLMProvider | undefined

  /**
   * Get all registered providers
   */
  getAll(): LLMProvider[]

  /**
   * Resolve provider for a model
   * @param model - Model identifier
   */
  resolveProvider(model: string): LLMProvider | undefined
}

// === Provider Factory Types ===

/**
 * Provider factory for creating provider instances
 */
export interface ProviderFactory {
  /**
   * Create a provider instance
   * @param config - Model configuration
   */
  create(config: ModelConfig): LLMProvider
}

/**
 * Provider configuration for factory
 */
export interface ProviderConfig {
  /** Provider type */
  type: string
  /** API key */
  apiKey?: string
  /** Base URL */
  baseUrl?: string
  /** Additional options */
  options?: Record<string, unknown>
}

// === Anthropic-specific Types ===

/**
 * Anthropic API request format
 */
export interface AnthropicRequest {
  model: string
  messages: Array<{
    role: "user" | "assistant"
    content: string | Array<{
      type: "text" | "image" | "tool_use" | "tool_result"
      text?: string
      source?: { type: "base64"; media_type: string; data: string }
      id?: string
      name?: string
      input?: Record<string, unknown>
      tool_use_id?: string
      content?: string | Array<{ type: "text"; text: string }>
      is_error?: boolean
    }>
  }>
  system?: string
  max_tokens: number
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  stream?: boolean
  tools?: Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
}

/**
 * Anthropic API response format
 */
export interface AnthropicResponse {
  id: string
  type: "message"
  role: "assistant"
  content: Array<{
    type: "text" | "tool_use"
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
  model: string
  stop_reason: string
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

// === OpenAI-specific Types ===

/**
 * OpenAI API request format
 */
export interface OpenAIRequest {
  model: string
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool"
    content: string | Array<{
      type: "text" | "image_url"
      text?: string
      image_url?: { url: string }
    }>
    name?: string
    tool_call_id?: string
    tool_calls?: Array<{
      id: string
      type: "function"
      function: { name: string; arguments: string }
    }>
  }>
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  stream?: boolean
  stream_options?: {
    include_usage?: boolean
  }
  tools?: Array<{
    type: "function"
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
}

/**
 * OpenAI API response format
 */
export interface OpenAIResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: "assistant"
      content: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
