/**
 * Session manager implementation
 * @module formagent-sdk/session/manager
 */

import type {
  Session,
  SessionConfig,
  SessionState,
  SessionStorage,
  SessionManager,
  CreateSessionOptions,
} from "../types/session"
import type { LLMProvider } from "../types/provider"
import { generateSessionId } from "../utils/id"
import { SessionImpl, createSessionImpl } from "./session"
import { MemorySessionStorage } from "./storage"

/**
 * Options for creating a SessionManager
 */
export interface SessionManagerOptions {
  /** Default session configuration */
  defaultConfig?: Partial<SessionConfig>
  /** Session storage backend */
  storage?: SessionStorage
  /** LLM provider instance */
  provider: LLMProvider
}

/**
 * Session manager implementation
 *
 * Manages the lifecycle of sessions: creation, retrieval, resumption, and cleanup.
 *
 * @example
 * ```ts
 * const manager = new SessionManagerImpl({
 *   provider: new AnthropicProvider({ apiKey: "..." }),
 *   storage: new MemorySessionStorage(),
 * })
 *
 * const session = await manager.create({ model: "claude-3-sonnet-20240229" })
 * await session.send("Hello!")
 *
 * for await (const event of session.receive()) {
 *   if (event.type === "text") {
 *     console.log(event.text)
 *   }
 * }
 *
 * await manager.close(session.id)
 * ```
 */
export class SessionManagerImpl implements SessionManager {
  private sessions: Map<string, Session> = new Map()
  private storage: SessionStorage
  private provider: LLMProvider
  private defaultConfig: Partial<SessionConfig>

  constructor(options: SessionManagerOptions) {
    this.storage = options.storage ?? new MemorySessionStorage()
    this.provider = options.provider
    this.defaultConfig = options.defaultConfig ?? {}
  }

  async create(config?: CreateSessionOptions): Promise<Session> {
    const mergedConfig: SessionConfig = {
      ...this.defaultConfig,
      ...config,
    }

    // Check for resume
    if (config?.resume) {
      return this.resume(config.resume, mergedConfig)
    }

    // Check for fork
    if (config?.fork) {
      return this.fork(config.fork, mergedConfig)
    }

    // Create new session
    const session = createSessionImpl(mergedConfig, this.provider)
    this.sessions.set(session.id, session)

    // Save initial state
    await this.storage.save(session.state)

    return session
  }

  async resume(sessionId: string, config?: Partial<SessionConfig>): Promise<Session> {
    // Check if session is already active
    const existingSession = this.sessions.get(sessionId)
    if (existingSession) {
      return existingSession
    }

    // Load from storage
    const state = await this.storage.load(sessionId)
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Merge config
    const mergedConfig: SessionConfig = {
      ...this.defaultConfig,
      ...config,
    }

    // Create session with existing state
    const session = createSessionImpl(mergedConfig, this.provider, state)
    this.sessions.set(session.id, session)

    return session
  }

  async fork(sessionId: string, config?: Partial<SessionConfig>): Promise<Session> {
    // Load original session state
    const originalState = await this.storage.load(sessionId)
    if (!originalState) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Merge config
    const mergedConfig: SessionConfig = {
      ...this.defaultConfig,
      ...config,
    }

    // Create new session with copied state
    const newId = generateSessionId()
    const forkedState: Partial<SessionState> = {
      ...originalState,
      id: newId,
      parentId: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Deep clone messages
      messages: JSON.parse(JSON.stringify(originalState.messages)),
    }

    const session = createSessionImpl(mergedConfig, this.provider, forkedState)
    this.sessions.set(session.id, session)

    // Save forked state
    await this.storage.save(session.state)

    return session
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  list(): string[] {
    return Array.from(this.sessions.keys())
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    // Save final state
    await this.storage.save(session.state)

    // Close session
    await session.close()

    // Remove from active sessions
    this.sessions.delete(sessionId)
  }

  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys())
    await Promise.all(sessionIds.map((id) => this.close(id)))
  }

  /**
   * Get the storage backend
   */
  getStorage(): SessionStorage {
    return this.storage
  }

  /**
   * Get the LLM provider
   */
  getProvider(): LLMProvider {
    return this.provider
  }
}

/**
 * Create a new session manager
 *
 * @param options - Session manager options
 * @returns SessionManager instance
 *
 * @example
 * ```ts
 * const manager = createSessionManager({
 *   provider: new AnthropicProvider({ apiKey: "..." }),
 * })
 * ```
 */
export function createSessionManager(options: SessionManagerOptions): SessionManager {
  return new SessionManagerImpl(options)
}
