/**
 * Type-safe event emitter utilities
 * @module formagent-sdk/utils/events
 */

import { EventEmitter } from "events"

/**
 * Event map type for defining event signatures
 */
export type EventMap = Record<string, unknown[]>

/**
 * Type-safe event emitter
 *
 * Provides full TypeScript type inference for event names and payloads.
 *
 * @example
 * ```ts
 * type MyEvents = {
 *   message: [string]
 *   error: [Error]
 *   progress: [number, string]
 * }
 *
 * const emitter = new TypedEventEmitter<MyEvents>()
 *
 * emitter.on("message", (text) => console.log(text)) // text is string
 * emitter.on("error", (err) => console.error(err))   // err is Error
 * emitter.on("progress", (percent, status) => { ... }) // percent: number, status: string
 *
 * emitter.emit("message", "Hello") // Type-checked
 * emitter.emit("error", new Error("oops"))
 * ```
 */
export class TypedEventEmitter<T extends EventMap> {
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
  }

  /**
   * Add event listener
   */
  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.on(event as string, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * Add one-time event listener
   */
  once<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.once(event as string, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * Remove event listener
   */
  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    this.emitter.off(event as string, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * Emit event
   */
  emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
    return this.emitter.emit(event as string, ...args)
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event as string)
    } else {
      this.emitter.removeAllListeners()
    }
    return this
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof T>(event: K): number {
    return this.emitter.listenerCount(event as string)
  }

  /**
   * Get all listeners for an event
   */
  listeners<K extends keyof T>(event: K): Array<(...args: T[K]) => void> {
    return this.emitter.listeners(event as string) as Array<(...args: T[K]) => void>
  }

  /**
   * Set max listeners
   */
  setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n)
    return this
  }

  /**
   * Get max listeners
   */
  getMaxListeners(): number {
    return this.emitter.getMaxListeners()
  }
}

/**
 * Session event types
 */
export type SessionEventMap = {
  message: [{ type: "user" | "assistant"; content: string }]
  text: [string]
  tool_use: [{ id: string; name: string; input: Record<string, unknown> }]
  tool_result: [{ id: string; output: string; isError?: boolean }]
  stop: [{ reason: string; usage: { input_tokens: number; output_tokens: number } }]
  error: [Error]
}

/**
 * Create a new session event emitter
 */
export function createSessionEmitter(): TypedEventEmitter<SessionEventMap> {
  return new TypedEventEmitter<SessionEventMap>()
}

/**
 * Agent event types
 */
export type AgentEventMap = {
  chunk: [{ type: string; content: string }]
  tool_call: [{ id: string; name: string; input: Record<string, unknown> }]
  tool_result: [{ id: string; output: string; error?: string }]
  message_complete: [{ role: string; content: unknown[] }]
  complete: [{ messages: unknown[]; usage: unknown }]
  error: [Error]
}

/**
 * Create a new agent event emitter
 */
export function createAgentEmitter(): TypedEventEmitter<AgentEventMap> {
  return new TypedEventEmitter<AgentEventMap>()
}

/**
 * Create a promise that resolves on a specific event
 *
 * @param emitter - Event emitter to listen on
 * @param event - Event to wait for
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise that resolves with event data
 *
 * @example
 * ```ts
 * const emitter = createSessionEmitter()
 *
 * // Wait for stop event with 30s timeout
 * const stopEvent = await waitForEvent(emitter, "stop", 30000)
 * ```
 */
export function waitForEvent<T extends EventMap, K extends keyof T>(
  emitter: TypedEventEmitter<T>,
  event: K,
  timeout?: number
): Promise<T[K]> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const listener = (...args: T[K]) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve(args)
    }

    emitter.once(event, listener)

    if (timeout) {
      timeoutId = setTimeout(() => {
        emitter.off(event, listener)
        reject(new Error(`Timeout waiting for event: ${String(event)}`))
      }, timeout)
    }
  })
}

/**
 * Create an async iterator from events
 *
 * @param emitter - Event emitter to listen on
 * @param event - Event to iterate over
 * @param endEvent - Event that signals iteration end
 * @returns Async iterator yielding event data
 *
 * @example
 * ```ts
 * const emitter = createSessionEmitter()
 *
 * for await (const text of iterateEvents(emitter, "text", "stop")) {
 *   console.log(text)
 * }
 * ```
 */
export async function* iterateEvents<T extends EventMap, K extends keyof T, E extends keyof T>(
  emitter: TypedEventEmitter<T>,
  event: K,
  endEvent: E
): AsyncGenerator<T[K][0], void, unknown> {
  const queue: T[K][0][] = []
  let ended = false
  let resolve: (() => void) | null = null

  const eventListener = (...args: T[K]) => {
    queue.push(args[0])
    resolve?.()
  }

  const endListener = () => {
    ended = true
    resolve?.()
  }

  emitter.on(event, eventListener)
  emitter.once(endEvent, endListener)

  try {
    while (!ended || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!
      } else if (!ended) {
        await new Promise<void>((r) => {
          resolve = r
        })
        resolve = null
      }
    }
  } finally {
    emitter.off(event, eventListener)
    emitter.off(endEvent, endListener)
  }
}
