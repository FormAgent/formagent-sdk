/**
 * Query type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/query
 */

import type { SDKMessage, ExtendedUsageInfo, ContentBlock } from "./core"
import type { SessionConfig } from "./session"

// === Query Input Types ===

/**
 * Input message for streaming mode
 */
export interface InputMessage {
  /** Message type */
  type: "user_message" | "tool_result" | "continue"
  /** Session ID (for multi-session routing) */
  session_id?: string
  /** User message content */
  message?: string | ContentBlock[]
  /** Tool result (for tool_result type) */
  tool_result?: {
    tool_use_id: string
    content: string | ContentBlock[]
    is_error?: boolean
  }
}

/**
 * Query input type - supports both string and streaming modes
 */
export type QueryInput = string | AsyncGenerator<InputMessage, void, unknown>

// === Query Options ===

/**
 * Options for query() function
 */
export interface QueryOptions extends Partial<SessionConfig> {
  /** Resume from existing session */
  resume?: string
  /** Fork from existing session */
  forkSession?: string
  /** Continue previous incomplete response */
  continue?: boolean
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Callback for each message */
  onMessage?: (message: SDKMessage) => void | Promise<void>
  /** Callback for text chunks */
  onText?: (text: string) => void | Promise<void>
  /** Callback for tool use */
  onToolUse?: (toolUse: { id: string; name: string; input: Record<string, unknown> }) => void | Promise<void>
  /** Callback for errors */
  onError?: (error: Error) => void | Promise<void>
}

// === Query Output Types ===

/**
 * Output message from query
 */
export type QueryMessage = SDKMessage & {
  /** Session ID this message belongs to */
  session_id: string
}

/**
 * Text chunk output
 */
export interface QueryTextChunk {
  type: "text"
  text: string
  session_id: string
}

/**
 * Tool use output
 */
export interface QueryToolUse {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
  session_id: string
}

/**
 * Tool result output
 */
export interface QueryToolResult {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
  session_id: string
}

/**
 * Query complete output
 */
export interface QueryComplete {
  type: "complete"
  session_id: string
  usage: ExtendedUsageInfo
  stop_reason: string
}

/**
 * Query error output
 */
export interface QueryError {
  type: "error"
  error: Error
  session_id?: string
}

/**
 * Union type for all query outputs
 */
export type QueryOutput =
  | QueryMessage
  | QueryTextChunk
  | QueryToolUse
  | QueryToolResult
  | QueryComplete
  | QueryError

// === Query Result ===

/**
 * Result from a completed query
 */
export interface QueryResult {
  /** Session ID */
  sessionId: string
  /** Final assistant message */
  message: SDKMessage
  /** All messages in the conversation */
  messages: SDKMessage[]
  /** Total usage statistics */
  usage: ExtendedUsageInfo
  /** Stop reason */
  stopReason: string
}

// === Prompt Function Types ===

/**
 * Options for prompt() convenience function
 */
export interface PromptOptions extends QueryOptions {
  /** Return only the text content (no metadata) */
  textOnly?: boolean
}

/**
 * Result from prompt() function when textOnly is false
 */
export interface PromptResult {
  /** Text response */
  text: string
  /** Full message */
  message: SDKMessage
  /** Usage statistics */
  usage: ExtendedUsageInfo
  /** Session ID */
  sessionId: string
}
