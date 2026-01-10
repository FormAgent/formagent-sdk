/**
 * Core type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/core
 */

// === Content Block Types (Claude SDK Compatible) ===

/**
 * Text content block
 */
export interface TextBlock {
  type: "text"
  text: string
}

/**
 * Image content block
 */
export interface ImageBlock {
  type: "image"
  source: {
    type: "base64" | "url"
    media_type?: string
    data?: string
    url?: string
  }
}

/**
 * Tool use content block (from assistant)
 */
export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Tool result content block (from user, in response to tool_use)
 */
export interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

/**
 * Union type for all content blocks
 */
export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock

// === Message Types (Claude SDK Compatible) ===

/**
 * Base message structure with common fields
 */
export interface BaseMessage {
  id?: string
  role: MessageRole
}

/**
 * Message role types
 */
export type MessageRole = "user" | "assistant" | "system"

/**
 * User message
 */
export interface UserMessage extends BaseMessage {
  role: "user"
  content: string | ContentBlock[]
}

/**
 * Assistant message
 */
export interface AssistantMessage extends BaseMessage {
  role: "assistant"
  content: ContentBlock[]
  stop_reason?: StopReason
  stop_sequence?: string | null
  usage?: UsageInfo
}

/**
 * System message (for internal use, not sent to API)
 */
export interface SystemMessage extends BaseMessage {
  role: "system"
  content: string
}

/**
 * Union type for SDK messages
 */
export type SDKMessage = UserMessage | AssistantMessage | SystemMessage

/**
 * Stop reason types
 */
export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use"

// === Usage Info Types ===

/**
 * Token usage information (Claude SDK compatible)
 */
export interface UsageInfo {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * Extended usage with cost information
 */
export interface ExtendedUsageInfo extends UsageInfo {
  total_cost_usd?: number
}

// === Model Configuration Types ===

/**
 * Supported LLM providers
 */
export type LLMProviderType = "anthropic" | "openai" | "deepseek" | "ollama" | "openrouter" | "custom"

/**
 * Model configuration (Claude SDK compatible with extensions)
 */
export interface ModelConfig {
  /** Provider type (auto-detected from model if not specified) */
  provider?: LLMProviderType
  /** Model identifier (e.g., "claude-3-opus-20240229", "gpt-4-turbo") */
  model: string
  /** API key (uses environment variable if not specified) */
  apiKey?: string
  /** API base URL (for custom endpoints) */
  baseUrl?: string
  /** Sampling temperature (0-2) */
  temperature?: number
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Top-p sampling */
  topP?: number
  /** Top-k sampling (Anthropic only) */
  topK?: number
  /** Stop sequences */
  stopSequences?: string[]
}

// === Event Types ===

/**
 * Base event structure
 */
export interface BaseEvent {
  type: string
  timestamp?: number
}

/**
 * Message start event
 */
export interface MessageStartEvent extends BaseEvent {
  type: "message_start"
  message: {
    id: string
    type: "message"
    role: "assistant"
    content: []
    model: string
    stop_reason: null
    stop_sequence: null
    usage: UsageInfo
  }
}

/**
 * Content block start event
 */
export interface ContentBlockStartEvent extends BaseEvent {
  type: "content_block_start"
  index: number
  content_block: ContentBlock
}

/**
 * Content block delta event
 */
export interface ContentBlockDeltaEvent extends BaseEvent {
  type: "content_block_delta"
  index: number
  delta: {
    type: "text_delta" | "input_json_delta"
    text?: string
    partial_json?: string
  }
}

/**
 * Content block stop event
 */
export interface ContentBlockStopEvent extends BaseEvent {
  type: "content_block_stop"
  index: number
}

/**
 * Message delta event
 */
export interface MessageDeltaEvent extends BaseEvent {
  type: "message_delta"
  delta: {
    stop_reason: StopReason
    stop_sequence?: string | null
  }
  usage: {
    output_tokens: number
    input_tokens?: number
  }
}

/**
 * Message stop event
 */
export interface MessageStopEvent extends BaseEvent {
  type: "message_stop"
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseEvent {
  type: "error"
  error: {
    type: string
    message: string
  }
}

/**
 * Union type for all streaming events
 */
export type StreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ErrorEvent

// === Utility Types ===

/**
 * Generic result type with success/error states
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * Async disposable interface (for await using support)
 */
export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>
}

/**
 * JSON schema type (simplified)
 */
export type JSONSchema = {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  description?: string
  [key: string]: unknown
}
