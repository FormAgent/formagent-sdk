/**
 * Session type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/session
 */

import type {
  SDKMessage,
  ModelConfig,
  UsageInfo,
  ExtendedUsageInfo,
  AsyncDisposable,
  ContentBlock,
} from "./core"
import type { ToolDefinition } from "./tool"
import type { SkillDefinition } from "./skill"
import type { SystemPromptConfig } from "./prompt"
import type { LLMProvider } from "./provider"
import type { HooksConfig, OutputFormat } from "./hooks"

// === Session Configuration ===

/**
 * Session configuration (Claude SDK compatible)
 */
export interface SessionConfig {
  /** Model configuration */
  model?: string | ModelConfig
  /** System prompt configuration */
  systemPrompt?: string | SystemPromptConfig
  /** Custom tools available in this session */
  tools?: ToolDefinition[]
  /** Skills to load */
  skills?: string[] | SkillDefinition[]
  /** Maximum turns before stopping */
  maxTurns?: number
  /** Allowed tools (filter from registered tools) */
  allowedTools?: string[] | { allow?: string[]; deny?: string[] }
  /** Session storage for persistence */
  storage?: SessionStorage
  /** Working directory for file operations */
  cwd?: string
  /** Enable cost tracking */
  trackCost?: boolean
  /** Hooks configuration for intercepting agent behavior */
  hooks?: HooksConfig
  /** Output format for structured outputs */
  outputFormat?: OutputFormat
  /** Skill source paths (absolute paths to skill directories) */
  settingSources?: string[]
}

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions extends SessionConfig {
  /** Resume from existing session ID */
  resume?: string
  /** Fork from existing session ID */
  fork?: string
  /** Custom LLM provider (overrides default) */
  provider?: LLMProvider
  /** Custom session storage (overrides default, enables persistence) */
  sessionStorage?: SessionStorage
}

// === Session State ===

/**
 * Session state (persisted data)
 */
export interface SessionState {
  /** Unique session identifier */
  id: string
  /** Conversation messages */
  messages: SDKMessage[]
  /** Accumulated usage statistics */
  usage: ExtendedUsageInfo
  /** Session metadata */
  metadata: Record<string, unknown>
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Parent session ID (if forked) */
  parentId?: string
}

// === Session Interface ===

/**
 * Send options for session.send()
 */
export interface SendOptions {
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * Receive options for session.receive()
 */
export interface ReceiveOptions {
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Continue from previous incomplete response */
  continue?: boolean
}

/**
 * Message event yielded by session.receive()
 */
export interface MessageEvent {
  type: "message"
  message: SDKMessage
}

/**
 * Text event yielded by session.receive()
 */
export interface TextEvent {
  type: "text"
  text: string
}

/**
 * Tool use event yielded by session.receive()
 */
export interface ToolUseEvent {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Tool result event
 */
export interface ToolResultEvent {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

/**
 * Stop event yielded when generation completes
 */
export interface StopEvent {
  type: "stop"
  stop_reason: string
  usage: ExtendedUsageInfo
}

/**
 * Result event for structured output
 */
export interface ResultEvent {
  type: "result"
  subtype: "success" | "error_max_structured_output_retries"
  /** Validated structured output (when subtype is success) */
  structured_output?: Record<string, unknown>
  /** Error message (when subtype is error) */
  error?: string
}

/**
 * Error event yielded on errors
 */
export interface SessionErrorEvent {
  type: "error"
  error: Error
}

/**
 * Union type for all session events
 */
export type SessionEvent =
  | MessageEvent
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | StopEvent
  | ResultEvent
  | SessionErrorEvent

/**
 * Session interface (Claude SDK compatible)
 */
export interface Session extends AsyncDisposable {
  /** Unique session identifier */
  readonly id: string
  /** Session configuration */
  readonly config: SessionConfig
  /** Current session state */
  readonly state: SessionState

  /**
   * Send a message to the session
   * @param message - User message (string or structured)
   * @param options - Send options
   */
  send(message: string | SDKMessage, options?: SendOptions): Promise<void>

  /**
   * Receive assistant response as async generator
   * @param options - Receive options
   * @returns AsyncGenerator yielding session events
   */
  receive(options?: ReceiveOptions): AsyncGenerator<SessionEvent, void, unknown>

  /**
   * Get conversation history
   */
  getMessages(): SDKMessage[]

  /**
   * Get accumulated usage statistics
   */
  getUsage(): ExtendedUsageInfo

  /**
   * Close the session and release resources
   */
  close(): Promise<void>
}

// === Session Storage ===

/**
 * Session storage interface for persistence
 */
export interface SessionStorage {
  /**
   * Save session state
   * @param state - Session state to save
   */
  save(state: SessionState): Promise<void>

  /**
   * Load session state by ID
   * @param sessionId - Session ID to load
   * @returns Session state or undefined if not found
   */
  load(sessionId: string): Promise<SessionState | undefined>

  /**
   * Delete session state
   * @param sessionId - Session ID to delete
   */
  delete(sessionId: string): Promise<void>

  /**
   * List all stored session IDs
   */
  list(): Promise<string[]>
}

// === Session Manager ===

/**
 * Session manager for creating and managing sessions
 */
export interface SessionManager {
  /**
   * Create a new session
   * @param config - Session configuration
   */
  create(config?: CreateSessionOptions): Promise<Session>

  /**
   * Resume an existing session
   * @param sessionId - Session ID to resume
   * @param config - Additional configuration
   */
  resume(sessionId: string, config?: Partial<SessionConfig>): Promise<Session>

  /**
   * Fork an existing session (create a branch)
   * @param sessionId - Session ID to fork from
   * @param config - Configuration for the forked session
   */
  fork(sessionId: string, config?: Partial<SessionConfig>): Promise<Session>

  /**
   * Get an active session by ID
   * @param sessionId - Session ID to get
   */
  get(sessionId: string): Session | undefined

  /**
   * List all active session IDs
   */
  list(): string[]

  /**
   * Close a session
   * @param sessionId - Session ID to close
   */
  close(sessionId: string): Promise<void>

  /**
   * Close all sessions
   */
  closeAll(): Promise<void>
}
