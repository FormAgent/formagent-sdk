/**
 * Public API functions (Claude SDK compatible)
 * @module formagent-sdk/api
 */

import type {
  Session,
  SessionConfig,
  CreateSessionOptions,
} from "./types/session"
import type {
  QueryInput,
  QueryOptions,
  QueryResult,
  PromptOptions,
  PromptResult,
  QueryOutput,
} from "./types/query"
import type { SDKMessage, ExtendedUsageInfo, ContentBlock } from "./types/core"
import type { LLMProvider } from "./types/provider"
import { SessionManagerImpl, createSessionManager } from "./session/manager"
import { MemorySessionStorage } from "./session/storage"
import { generateSessionId } from "./utils/id"
import { AnthropicProvider } from "./llm/anthropic"
import { OpenAIProvider } from "./llm/openai"

/**
 * Global session manager instance (lazy initialized)
 */
let globalManager: SessionManagerImpl | null = null

/**
 * Default provider instance (needs to be set before use)
 */
let defaultProvider: LLMProvider | null = null

/**
 * Set the default LLM provider
 *
 * @param provider - LLM provider instance
 *
 * @example
 * ```ts
 * import { setDefaultProvider } from "formagent-sdk"
 * import { AnthropicProvider } from "formagent-sdk/providers/anthropic"
 *
 * setDefaultProvider(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }))
 * ```
 */
export function setDefaultProvider(provider: LLMProvider): void {
  defaultProvider = provider

  // Reset global manager to use new provider
  globalManager = null
}

/**
 * Get or create the global session manager
 *
 * If no default provider is set, automatically creates a provider
 * based on available environment variables:
 * - ANTHROPIC_API_KEY -> AnthropicProvider
 * - OPENAI_API_KEY -> OpenAIProvider
 */
function getGlobalManager(): SessionManagerImpl {
  if (!globalManager) {
    // If no provider set, try to auto-create from env vars
    if (!defaultProvider) {
      if (process.env.ANTHROPIC_API_KEY) {
        defaultProvider = new AnthropicProvider()
      } else if (process.env.OPENAI_API_KEY) {
        defaultProvider = new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY,
          baseUrl: process.env.OPENAI_BASE_URL,
        })
      } else {
        throw new Error(
          "No default provider set. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable, " +
          "call setDefaultProvider(), or pass a provider in the options."
        )
      }
    }

    globalManager = new SessionManagerImpl({
      provider: defaultProvider,
      storage: new MemorySessionStorage(),
    })
  }

  return globalManager
}

/**
 * Create a new session
 *
 * @param options - Session configuration options
 * @returns A new Session instance
 *
 * @example
 * ```ts
 * const session = await createSession({
 *   model: "claude-3-sonnet-20240229",
 *   systemPrompt: "You are a helpful assistant.",
 *   tools: [myTool],
 * })
 *
 * await session.send("Hello!")
 *
 * for await (const event of session.receive()) {
 *   if (event.type === "text") {
 *     process.stdout.write(event.text)
 *   }
 * }
 * ```
 */
export async function createSession(options?: CreateSessionOptions): Promise<Session> {
  // If a custom provider is specified, create a new manager with that provider
  if (options?.provider) {
    const customManager = new SessionManagerImpl({
      provider: options.provider,
      storage: new MemorySessionStorage(),
    })
    return customManager.create(options)
  }

  const manager = getGlobalManager()
  return manager.create(options)
}

/**
 * Resume an existing session
 *
 * @param sessionId - ID of the session to resume
 * @param options - Additional configuration options
 * @returns The resumed Session instance
 *
 * @example
 * ```ts
 * const session = await resumeSession("sess_abc123")
 *
 * await session.send("Continue from where we left off")
 * for await (const event of session.receive()) {
 *   // ...
 * }
 * ```
 */
export async function resumeSession(
  sessionId: string,
  options?: Partial<SessionConfig>
): Promise<Session> {
  const manager = getGlobalManager()
  return manager.resume(sessionId, options)
}

/**
 * Fork an existing session
 *
 * Creates a new session with a copy of the conversation history.
 *
 * @param sessionId - ID of the session to fork
 * @param options - Configuration options for the forked session
 * @returns A new Session instance with copied history
 */
export async function forkSession(
  sessionId: string,
  options?: Partial<SessionConfig>
): Promise<Session> {
  const manager = getGlobalManager()
  return manager.fork(sessionId, options)
}

/**
 * Simple prompt function for single-turn interactions
 *
 * @param input - User input (string)
 * @param options - Prompt options
 * @returns Response text or full result based on options
 *
 * @example
 * ```ts
 * // Simple usage - returns just the text
 * const response = await prompt("What is 2+2?")
 * console.log(response) // "4"
 *
 * // With full result
 * const result = await prompt("What is 2+2?", { textOnly: false })
 * console.log(result.text) // "4"
 * console.log(result.usage) // { input_tokens: 10, output_tokens: 5 }
 * ```
 */
export async function prompt(input: string, options?: PromptOptions): Promise<string>
export async function prompt(
  input: string,
  options: PromptOptions & { textOnly: false }
): Promise<PromptResult>
export async function prompt(
  input: string,
  options?: PromptOptions
): Promise<string | PromptResult> {
  // Create a temporary session
  const session = await createSession(options)

  try {
    // Send the message
    await session.send(input)

    // Collect response
    let text = ""
    let message: SDKMessage | undefined
    let usage: ExtendedUsageInfo = { input_tokens: 0, output_tokens: 0 }

    for await (const event of session.receive()) {
      if (event.type === "text") {
        text += event.text
      } else if (event.type === "message") {
        message = event.message
      } else if (event.type === "stop") {
        usage = event.usage
      } else if (event.type === "error") {
        throw event.error
      }
    }

    // Return based on options
    if (options?.textOnly === false) {
      return {
        text,
        message: message!,
        usage,
        sessionId: session.id,
      }
    }

    return text
  } finally {
    await session.close()
  }
}

/**
 * Query function for streaming interactions
 *
 * Supports both string input (single mode) and async generator input (streaming mode).
 *
 * @param input - Query input (string or AsyncGenerator)
 * @param options - Query options
 * @returns AsyncGenerator yielding query outputs
 *
 * @example
 * ```ts
 * // String mode (single message)
 * for await (const output of query("Hello!")) {
 *   if (output.type === "text") {
 *     process.stdout.write(output.text)
 *   }
 * }
 *
 * // Streaming mode (multiple messages)
 * async function* inputStream() {
 *   yield { type: "user_message", message: "Hello!" }
 *   yield { type: "user_message", message: "How are you?" }
 * }
 *
 * for await (const output of query(inputStream())) {
 *   // ...
 * }
 * ```
 */
export async function* query(
  input: QueryInput,
  options?: QueryOptions
): AsyncGenerator<QueryOutput, QueryResult, unknown> {
  // Create or resume session
  let session: Session

  if (options?.resume) {
    session = await resumeSession(options.resume, options)
  } else if (options?.forkSession) {
    session = await forkSession(options.forkSession, options)
  } else {
    session = await createSession(options)
  }

  const sessionId = session.id

  try {
    // Handle string input
    if (typeof input === "string") {
      await session.send(input)

      let finalMessage: SDKMessage | undefined
      let finalUsage: ExtendedUsageInfo = { input_tokens: 0, output_tokens: 0 }
      let stopReason = "end_turn"

      for await (const event of session.receive()) {
        if (event.type === "text") {
          const output: QueryOutput = {
            type: "text",
            text: event.text,
            session_id: sessionId,
          }
          yield output
          options?.onText?.(event.text)
        } else if (event.type === "tool_use") {
          const output: QueryOutput = {
            type: "tool_use",
            id: event.id,
            name: event.name,
            input: event.input,
            session_id: sessionId,
          }
          yield output
          options?.onToolUse?.(event)
        } else if (event.type === "tool_result") {
          const output: QueryOutput = {
            type: "tool_result",
            tool_use_id: event.tool_use_id,
            content: event.content,
            is_error: event.is_error,
            session_id: sessionId,
          }
          yield output
        } else if (event.type === "message") {
          finalMessage = event.message
          options?.onMessage?.(event.message)
        } else if (event.type === "stop") {
          finalUsage = event.usage
          stopReason = event.stop_reason
        } else if (event.type === "error") {
          const output: QueryOutput = {
            type: "error",
            error: event.error,
            session_id: sessionId,
          }
          yield output
          options?.onError?.(event.error)
        }
      }

      // Yield complete event
      const completeOutput: QueryOutput = {
        type: "complete",
        session_id: sessionId,
        usage: finalUsage,
        stop_reason: stopReason,
      }
      yield completeOutput

      // Return final result
      return {
        sessionId,
        message: finalMessage!,
        messages: session.getMessages(),
        usage: finalUsage,
        stopReason,
      }
    }

    // Handle async generator input (streaming mode)
    let finalMessage: SDKMessage | undefined
    let finalUsage: ExtendedUsageInfo = { input_tokens: 0, output_tokens: 0 }
    let stopReason = "end_turn"

    for await (const inputMessage of input) {
      if (inputMessage.type === "user_message" && inputMessage.message) {
        await session.send(
          typeof inputMessage.message === "string"
            ? inputMessage.message
            : { role: "user", content: inputMessage.message }
        )

        for await (const event of session.receive()) {
          if (event.type === "text") {
            const output: QueryOutput = {
              type: "text",
              text: event.text,
              session_id: sessionId,
            }
            yield output
            options?.onText?.(event.text)
          } else if (event.type === "message") {
            finalMessage = event.message
            options?.onMessage?.(event.message)
          } else if (event.type === "stop") {
            finalUsage = event.usage
            stopReason = event.stop_reason
          } else if (event.type === "error") {
            const output: QueryOutput = {
              type: "error",
              error: event.error,
              session_id: sessionId,
            }
            yield output
            options?.onError?.(event.error)
          }
        }
      }
    }

    // Yield complete event
    const completeOutput: QueryOutput = {
      type: "complete",
      session_id: sessionId,
      usage: finalUsage,
      stop_reason: stopReason,
    }
    yield completeOutput

    // Return final result
    return {
      sessionId,
      message: finalMessage!,
      messages: session.getMessages(),
      usage: finalUsage,
      stopReason,
    }
  } catch (error) {
    const errorOutput: QueryOutput = {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
      session_id: sessionId,
    }
    yield errorOutput
    throw error
  }
}

/**
 * Close all active sessions
 *
 * Call this when shutting down to clean up resources.
 */
export async function closeAllSessions(): Promise<void> {
  if (globalManager) {
    await globalManager.closeAll()
    globalManager = null
  }
}
