/**
 * Session storage implementations
 * @module formagent-sdk/session/storage
 */

import type { SessionState, SessionStorage } from "../types/session"

/**
 * In-memory session storage implementation
 *
 * Stores session state in a Map. Useful for development and testing.
 * Data is lost when the process exits.
 *
 * @example
 * ```ts
 * const storage = new MemorySessionStorage()
 *
 * await storage.save(sessionState)
 * const loaded = await storage.load(sessionId)
 * ```
 */
export class MemorySessionStorage implements SessionStorage {
  private sessions: Map<string, SessionState> = new Map()

  async save(state: SessionState): Promise<void> {
    // Clone state to prevent external mutations
    const cloned = JSON.parse(JSON.stringify(state))
    this.sessions.set(state.id, cloned)
  }

  async load(sessionId: string): Promise<SessionState | undefined> {
    const state = this.sessions.get(sessionId)
    if (!state) {
      return undefined
    }
    // Return a clone to prevent external mutations
    return JSON.parse(JSON.stringify(state))
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys())
  }

  /**
   * Clear all stored sessions
   */
  clear(): void {
    this.sessions.clear()
  }

  /**
   * Get the number of stored sessions
   */
  size(): number {
    return this.sessions.size
  }
}

/**
 * File-based session storage implementation
 *
 * Stores session state as JSON files in a directory.
 * Provides persistence across process restarts.
 *
 * @example
 * ```ts
 * const storage = new FileSessionStorage("./sessions")
 *
 * await storage.save(sessionState)
 * const loaded = await storage.load(sessionId)
 * ```
 */
export class FileSessionStorage implements SessionStorage {
  private directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  private getFilePath(sessionId: string): string {
    return `${this.directory}/${sessionId}.json`
  }

  async save(state: SessionState): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises")

    // Ensure directory exists
    await mkdir(this.directory, { recursive: true })

    const filePath = this.getFilePath(state.id)
    const content = JSON.stringify(state, null, 2)
    await writeFile(filePath, content, "utf-8")
  }

  async load(sessionId: string): Promise<SessionState | undefined> {
    const { readFile } = await import("fs/promises")

    try {
      const filePath = this.getFilePath(sessionId)
      const content = await readFile(filePath, "utf-8")
      return JSON.parse(content) as SessionState
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined
      }
      throw error
    }
  }

  async delete(sessionId: string): Promise<void> {
    const { unlink } = await import("fs/promises")

    try {
      const filePath = this.getFilePath(sessionId)
      await unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }

  async list(): Promise<string[]> {
    const { readdir } = await import("fs/promises")

    try {
      const files = await readdir(this.directory)
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5)) // Remove .json extension
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }
}

/**
 * Create a session storage instance
 *
 * @param type - Storage type ("memory" or "file")
 * @param options - Options for the storage
 * @returns SessionStorage instance
 */
export function createSessionStorage(
  type: "memory" | "file" = "memory",
  options?: { directory?: string }
): SessionStorage {
  if (type === "file") {
    if (!options?.directory) {
      throw new Error("File storage requires a directory option")
    }
    return new FileSessionStorage(options.directory)
  }
  return new MemorySessionStorage()
}
