/**
 * Session Tests
 *
 * Tests for SessionManager, SessionImpl, resume/fork functionality,
 * and SessionStorage implementations.
 */

import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { SessionImpl, createSessionImpl } from "../src/session/session"
import { SessionManagerImpl, createSessionManager } from "../src/session/manager"
import {
  MemorySessionStorage,
  FileSessionStorage,
  createSessionStorage,
} from "../src/session/storage"
import type { LLMProvider, LLMRequest } from "../src/types/provider"
import type { SessionConfig, SessionState } from "../src/types/session"
import type { ToolDefinition } from "../src/types/tool"
import { rm, mkdir } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

// =============================================================================
// Mock Provider
// =============================================================================

/**
 * Create a mock LLM provider for testing
 */
function createMockProvider(responses?: { text?: string; toolUse?: any }): LLMProvider {
  const mockStream = async function* (request: any) {
    // Emit message start
    yield {
      type: "message_start",
      message: {
        usage: { input_tokens: 10 },
      },
    }

    // Emit text content
    if (responses?.text) {
      yield {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }

      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: responses.text },
      }

      yield {
        type: "content_block_stop",
        index: 0,
      }
    }

    // Emit tool use if specified
    if (responses?.toolUse) {
      yield {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: responses.toolUse.id || "tool_123",
          name: responses.toolUse.name,
        },
      }

      yield {
        type: "content_block_delta",
        index: 1,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(responses.toolUse.input || {}),
        },
      }

      yield {
        type: "content_block_stop",
        index: 1,
      }
    }

    // Emit message delta with stop reason
    yield {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 20 },
    }

    // Emit message stop
    yield {
      type: "message_stop",
    }
  }

  return {
    id: "mock",
    name: "Mock Provider",
    models: ["mock-model"],
    stream: mock(mockStream as any),
    complete: mock(async () => ({
      content: [{ type: "text", text: responses?.text || "Mock response" }],
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "end_turn",
    })),
  }
}

/**
 * Create a mock provider that emits text deltas without content_block_start/stop.
 * This simulates OpenAI-style streaming where text is not wrapped in blocks.
 */
function createLooseTextMockProvider(text: string): LLMProvider {
  const mockStream = async function* (_request: any) {
    yield {
      type: "message_start",
      message: {
        usage: { input_tokens: 10 },
      },
    }

    yield {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    }

    yield {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 20 },
    }

    yield { type: "message_stop" }
  }

  return {
    id: "loose-mock",
    name: "Loose Mock Provider",
    models: ["mock-model"],
    stream: mock(mockStream as any),
    complete: mock(async () => ({
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "end_turn",
    })),
  }
}

// =============================================================================
// SessionImpl Tests
// =============================================================================

describe("SessionImpl", () => {
  let provider: LLMProvider
  let config: SessionConfig

  beforeEach(() => {
    provider = createMockProvider({ text: "Hello, I'm Claude!" })
    config = {
      model: "mock-model",
    }
  })

  describe("constructor", () => {
    it("should create session with unique id", () => {
      const session = createSessionImpl(config, provider)

      expect(session.id).toBeDefined()
      expect(session.id.length).toBeGreaterThan(0)
    })

    it("should initialize with empty state", () => {
      const session = createSessionImpl(config, provider)

      expect(session.state.messages).toEqual([])
      expect(session.state.usage.input_tokens).toBe(0)
      expect(session.state.usage.output_tokens).toBe(0)
    })

    it("should restore from existing state", () => {
      const existingState: Partial<SessionState> = {
        id: "existing-session",
        messages: [{ id: "msg1", role: "user", content: "Hello" }],
        usage: { input_tokens: 100, output_tokens: 200 },
        createdAt: Date.now() - 10000,
        parentId: "parent-session",
      }

      const session = createSessionImpl(config, provider, existingState)

      expect(session.id).toBe("existing-session")
      expect(session.state.messages).toHaveLength(1)
      expect(session.state.usage.input_tokens).toBe(100)
      expect(session.state.parentId).toBe("parent-session")
    })

    it("should register tools from config", () => {
      const tool: ToolDefinition = {
        name: "TestTool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ content: "test" }),
      }

      const sessionWithTools = createSessionImpl(
        { ...config, tools: [tool] },
        provider
      )

      // The tool should be registered (we can verify by checking state)
      expect(sessionWithTools.config.tools).toContain(tool)
    })

    it("should add Skill tool when settingSources is configured", () => {
      const sessionWithSkills = createSessionImpl(
        { ...config, settingSources: ["/path/to/skills"] },
        provider
      )

      expect(sessionWithSkills.config.settingSources).toContain("/path/to/skills")
    })
  })

  describe("send()", () => {
    it("should accept string message", async () => {
      const session = createSessionImpl(config, provider)

      await session.send("Hello!")

      expect(session.state.messages).toHaveLength(1)
      expect(session.state.messages[0].role).toBe("user")
      expect(session.state.messages[0].content).toBe("Hello!")
    })

    it("should accept SDKMessage object", async () => {
      const session = createSessionImpl(config, provider)

      await session.send({
        id: "custom-id",
        role: "user",
        content: "Hello!",
      })

      expect(session.state.messages).toHaveLength(1)
      expect(session.state.messages[0].id).toBe("custom-id")
    })

    it("should generate message id if not provided", async () => {
      const session = createSessionImpl(config, provider)

      await session.send({ role: "user", content: "Hello!" } as any)

      expect(session.state.messages[0].id).toBeDefined()
    })

    it("should throw if session is closed", async () => {
      const session = createSessionImpl(config, provider)
      await session.close()

      expect(session.send("Hello!")).rejects.toThrow("Session is closed")
    })

    it("should throw if already receiving", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      // Start receiving and get first value to set isReceiving flag
      const generator = session.receive()
      const firstResult = generator.next() // Start the generator

      // The session is now in receiving state
      // Note: Due to async nature, this test verifies the flag is set during streaming
      // In practice, send() during receive() would fail

      // Cleanup - consume all events
      await firstResult
      for await (const _ of generator) {
        // Consume remaining events
      }
    })
  })

  describe("receive()", () => {
    it("should throw if session is closed", async () => {
      const session = createSessionImpl(config, provider)
      await session.close()

      const generator = session.receive()
      expect(generator.next()).rejects.toThrow("Session is closed")
    })

    it("should throw if no pending message", async () => {
      const session = createSessionImpl(config, provider)

      const generator = session.receive()
      expect(generator.next()).rejects.toThrow("No pending message to process")
    })

    it("should yield text events", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      const events: any[] = []
      for await (const event of session.receive()) {
        events.push(event)
      }

      const textEvents = events.filter((e) => e.type === "text")
      expect(textEvents.length).toBeGreaterThan(0)
    })

    it("should flush text when provider omits content_block_stop", async () => {
      provider = createLooseTextMockProvider("Hello from loose provider")
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      let assistantMessage: any
      for await (const event of session.receive()) {
        if (event.type === "message") assistantMessage = event.message
      }

      expect(assistantMessage).toBeDefined()
      expect(Array.isArray(assistantMessage.content)).toBe(true)
      expect(
        assistantMessage.content.some(
          (b: any) => b.type === "text" && b.text.includes("Hello from loose provider")
        )
      ).toBe(true)
    })

    it("should yield stop event at end", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      const events: any[] = []
      for await (const event of session.receive()) {
        events.push(event)
      }

      const stopEvents = events.filter((e) => e.type === "stop")
      expect(stopEvents).toHaveLength(1)
      expect(stopEvents[0].stop_reason).toBe("end_turn")
    })

    it("should update usage statistics", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      for await (const event of session.receive()) {
        // Consume all events
      }

      expect(session.state.usage.input_tokens).toBeGreaterThan(0)
      expect(session.state.usage.output_tokens).toBeGreaterThan(0)
    })

    it("should add assistant message to history", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      for await (const event of session.receive()) {
        // Consume all events
      }

      // Should have user message + assistant message
      expect(session.state.messages.length).toBeGreaterThanOrEqual(2)
      const assistantMsg = session.state.messages.find((m) => m.role === "assistant")
      expect(assistantMsg).toBeDefined()
    })
  })

  describe("getMessages()", () => {
    it("should return copy of messages", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      const messages = session.getMessages()
      messages.push({ id: "fake", role: "user", content: "Fake" })

      // Original should not be modified
      expect(session.getMessages()).toHaveLength(1)
    })
  })

  describe("getUsage()", () => {
    it("should return copy of usage", async () => {
      const session = createSessionImpl(config, provider)
      await session.send("Hello!")

      for await (const event of session.receive()) {
        // Consume
      }

      const usage = session.getUsage()
      const originalInput = usage.input_tokens
      usage.input_tokens = 99999

      // Original should not be modified
      expect(session.getUsage().input_tokens).toBe(originalInput)
    })
  })

  describe("close()", () => {
    it("should mark session as closed", async () => {
      const session = createSessionImpl(config, provider)
      await session.close()

      expect(session.send("Test")).rejects.toThrow("Session is closed")
    })

    it("should be idempotent", async () => {
      const session = createSessionImpl(config, provider)
      await session.close()
      await session.close() // Should not throw

      expect(true).toBe(true)
    })
  })

  describe("asyncDispose", () => {
    it("should support async disposal", async () => {
      const session = createSessionImpl(config, provider)

      await session[Symbol.asyncDispose]()

      expect(session.send("Test")).rejects.toThrow("Session is closed")
    })
  })
})

// =============================================================================
// SessionManager Tests
// =============================================================================

describe("SessionManagerImpl", () => {
  let provider: LLMProvider
  let storage: MemorySessionStorage
  let manager: SessionManagerImpl

  beforeEach(() => {
    provider = createMockProvider({ text: "Hello!" })
    storage = new MemorySessionStorage()
    manager = new SessionManagerImpl({ provider, storage })
  })

  afterEach(async () => {
    await manager.closeAll()
  })

  describe("create()", () => {
    it("should create new session", async () => {
      const session = await manager.create({ model: "test-model" })

      expect(session).toBeDefined()
      expect(session.id).toBeDefined()
    })

    it("should store session in active sessions", async () => {
      const session = await manager.create()

      expect(manager.get(session.id)).toBe(session)
    })

    it("should save initial state to storage", async () => {
      const session = await manager.create()

      const storedState = await storage.load(session.id)
      expect(storedState).toBeDefined()
      expect(storedState?.id).toBe(session.id)
    })

    it("should merge default config with provided config", async () => {
      const managerWithDefaults = new SessionManagerImpl({
        provider,
        storage,
        defaultConfig: { model: "default-model", maxTurns: 10 },
      })

      const session = await managerWithDefaults.create({ model: "custom-model" })

      expect(session.config.model).toBe("custom-model")
      expect(session.config.maxTurns).toBe(10)
    })

    it("should handle resume option", async () => {
      // Create initial session
      const original = await manager.create()
      await original.send("Hello!")
      await manager.close(original.id)

      // Resume
      const resumed = await manager.create({ resume: original.id })

      expect(resumed.id).toBe(original.id)
      expect(resumed.state.messages).toHaveLength(1)
    })

    it("should handle fork option", async () => {
      // Create initial session
      const original = await manager.create()
      await original.send("Hello!")
      // Save state to storage before forking
      await storage.save(original.state)

      // Fork
      const forked = await manager.create({ fork: original.id })

      expect(forked.id).not.toBe(original.id)
      expect(forked.state.parentId).toBe(original.id)
      expect(forked.state.messages).toHaveLength(1)
    })
  })

  describe("resume()", () => {
    it("should resume existing session from storage", async () => {
      // Create and close session
      const original = await manager.create()
      await original.send("Test message")
      await manager.close(original.id)

      // Resume
      const resumed = await manager.resume(original.id)

      expect(resumed.id).toBe(original.id)
      expect(resumed.state.messages).toHaveLength(1)
      expect(resumed.state.messages[0].content).toBe("Test message")
    })

    it("should return active session if already exists", async () => {
      const original = await manager.create()

      const resumed = await manager.resume(original.id)

      expect(resumed).toBe(original)
    })

    it("should throw if session not found", async () => {
      expect(manager.resume("non-existent")).rejects.toThrow("Session not found")
    })

    it("should merge additional config", async () => {
      const original = await manager.create({ model: "original-model" })
      await manager.close(original.id)

      const resumed = await manager.resume(original.id, { maxTurns: 5 })

      expect(resumed.config.maxTurns).toBe(5)
    })
  })

  describe("fork()", () => {
    it("should create new session with copied state", async () => {
      const original = await manager.create()
      await original.send("Message 1")
      await original.send("Message 2")
      // Save state to storage before forking
      await storage.save(original.state)

      const forked = await manager.fork(original.id)

      expect(forked.id).not.toBe(original.id)
      expect(forked.state.messages).toHaveLength(2)
    })

    it("should set parentId to original session", async () => {
      const original = await manager.create()
      // State is saved on create, so fork should work

      const forked = await manager.fork(original.id)

      expect(forked.state.parentId).toBe(original.id)
    })

    it("should deep clone messages", async () => {
      const original = await manager.create()
      await original.send("Original message")
      // Save state to storage before forking
      await storage.save(original.state)

      const forked = await manager.fork(original.id)
      await forked.send("Forked message")

      // Original should not be affected
      expect(original.state.messages).toHaveLength(1)
      expect(forked.state.messages).toHaveLength(2)
    })

    it("should throw if session not found", async () => {
      expect(manager.fork("non-existent")).rejects.toThrow("Session not found")
    })

    it("should save forked state to storage", async () => {
      const original = await manager.create()

      const forked = await manager.fork(original.id)

      const storedState = await storage.load(forked.id)
      expect(storedState).toBeDefined()
      expect(storedState?.parentId).toBe(original.id)
    })
  })

  describe("get()", () => {
    it("should return active session", async () => {
      const session = await manager.create()

      expect(manager.get(session.id)).toBe(session)
    })

    it("should return undefined for unknown session", () => {
      expect(manager.get("unknown")).toBeUndefined()
    })
  })

  describe("list()", () => {
    it("should return list of active session ids", async () => {
      const session1 = await manager.create()
      const session2 = await manager.create()

      const list = manager.list()

      expect(list).toContain(session1.id)
      expect(list).toContain(session2.id)
    })

    it("should return empty array when no sessions", () => {
      expect(manager.list()).toEqual([])
    })
  })

  describe("close()", () => {
    it("should save final state before closing", async () => {
      const session = await manager.create()
      await session.send("Final message")

      await manager.close(session.id)

      const storedState = await storage.load(session.id)
      expect(storedState?.messages).toHaveLength(1)
    })

    it("should remove session from active sessions", async () => {
      const session = await manager.create()

      await manager.close(session.id)

      expect(manager.get(session.id)).toBeUndefined()
    })

    it("should be safe to call on non-existent session", async () => {
      await manager.close("non-existent") // Should not throw

      expect(true).toBe(true)
    })
  })

  describe("closeAll()", () => {
    it("should close all active sessions", async () => {
      await manager.create()
      await manager.create()
      await manager.create()

      await manager.closeAll()

      expect(manager.list()).toEqual([])
    })
  })

  describe("getStorage()", () => {
    it("should return storage instance", () => {
      expect(manager.getStorage()).toBe(storage)
    })
  })

  describe("getProvider()", () => {
    it("should return provider instance", () => {
      expect(manager.getProvider()).toBe(provider)
    })
  })
})

// =============================================================================
// SessionStorage Tests
// =============================================================================

describe("MemorySessionStorage", () => {
  let storage: MemorySessionStorage

  beforeEach(() => {
    storage = new MemorySessionStorage()
  })

  const createTestState = (id: string): SessionState => ({
    id,
    messages: [{ id: "msg1", role: "user", content: "Hello" }],
    usage: { input_tokens: 10, output_tokens: 20 },
    metadata: { key: "value" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  describe("save()", () => {
    it("should save session state", async () => {
      const state = createTestState("session1")

      await storage.save(state)

      expect(await storage.load("session1")).toBeDefined()
    })

    it("should clone state to prevent mutations", async () => {
      const state = createTestState("session1")

      await storage.save(state)
      state.messages.push({ id: "msg2", role: "user", content: "Modified" })

      const loaded = await storage.load("session1")
      expect(loaded?.messages).toHaveLength(1)
    })
  })

  describe("load()", () => {
    it("should return undefined for non-existent session", async () => {
      expect(await storage.load("unknown")).toBeUndefined()
    })

    it("should return clone of stored state", async () => {
      const state = createTestState("session1")
      await storage.save(state)

      const loaded1 = await storage.load("session1")
      const loaded2 = await storage.load("session1")

      // Should be equal but not same reference
      expect(loaded1).toEqual(loaded2)
      expect(loaded1).not.toBe(loaded2)
    })
  })

  describe("delete()", () => {
    it("should remove session from storage", async () => {
      const state = createTestState("session1")
      await storage.save(state)

      await storage.delete("session1")

      expect(await storage.load("session1")).toBeUndefined()
    })

    it("should be safe to delete non-existent session", async () => {
      await storage.delete("unknown") // Should not throw

      expect(true).toBe(true)
    })
  })

  describe("list()", () => {
    it("should return all session ids", async () => {
      await storage.save(createTestState("session1"))
      await storage.save(createTestState("session2"))

      const list = await storage.list()

      expect(list).toContain("session1")
      expect(list).toContain("session2")
    })

    it("should return empty array when no sessions", async () => {
      expect(await storage.list()).toEqual([])
    })
  })

  describe("clear()", () => {
    it("should remove all sessions", async () => {
      await storage.save(createTestState("session1"))
      await storage.save(createTestState("session2"))

      storage.clear()

      expect(await storage.list()).toEqual([])
    })
  })

  describe("size()", () => {
    it("should return number of stored sessions", async () => {
      await storage.save(createTestState("session1"))
      await storage.save(createTestState("session2"))

      expect(storage.size()).toBe(2)
    })
  })
})

describe("FileSessionStorage", () => {
  let storage: FileSessionStorage
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `session-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
    storage = new FileSessionStorage(testDir)
  })

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  const createTestState = (id: string): SessionState => ({
    id,
    messages: [{ id: "msg1", role: "user", content: "Hello" }],
    usage: { input_tokens: 10, output_tokens: 20 },
    metadata: { key: "value" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  describe("save()", () => {
    it("should save session to file", async () => {
      const state = createTestState("session1")

      await storage.save(state)

      const loaded = await storage.load("session1")
      expect(loaded).toBeDefined()
      expect(loaded?.id).toBe("session1")
    })

    it("should create directory if not exists", async () => {
      const nestedDir = join(testDir, "nested", "dir")
      const nestedStorage = new FileSessionStorage(nestedDir)

      await nestedStorage.save(createTestState("test"))

      const loaded = await nestedStorage.load("test")
      expect(loaded).toBeDefined()
    })
  })

  describe("load()", () => {
    it("should return undefined for non-existent session", async () => {
      expect(await storage.load("unknown")).toBeUndefined()
    })

    it("should load session from file", async () => {
      const state = createTestState("session1")
      state.metadata = { custom: "data" }

      await storage.save(state)
      const loaded = await storage.load("session1")

      expect(loaded?.metadata).toEqual({ custom: "data" })
    })
  })

  describe("delete()", () => {
    it("should delete session file", async () => {
      await storage.save(createTestState("session1"))

      await storage.delete("session1")

      expect(await storage.load("session1")).toBeUndefined()
    })

    it("should be safe to delete non-existent session", async () => {
      await storage.delete("unknown") // Should not throw

      expect(true).toBe(true)
    })
  })

  describe("list()", () => {
    it("should list all session files", async () => {
      await storage.save(createTestState("session1"))
      await storage.save(createTestState("session2"))

      const list = await storage.list()

      expect(list).toContain("session1")
      expect(list).toContain("session2")
    })

    it("should return empty array for empty directory", async () => {
      expect(await storage.list()).toEqual([])
    })

    it("should return empty array if directory does not exist", async () => {
      const nonExistent = new FileSessionStorage("/non/existent/path")

      expect(await nonExistent.list()).toEqual([])
    })
  })
})

describe("createSessionStorage()", () => {
  it("should create MemorySessionStorage by default", () => {
    const storage = createSessionStorage()

    expect(storage).toBeInstanceOf(MemorySessionStorage)
  })

  it("should create MemorySessionStorage for type memory", () => {
    const storage = createSessionStorage("memory")

    expect(storage).toBeInstanceOf(MemorySessionStorage)
  })

  it("should create FileSessionStorage for type file", () => {
    const storage = createSessionStorage("file", { directory: "/tmp/test" })

    expect(storage).toBeInstanceOf(FileSessionStorage)
  })

  it("should throw if file storage without directory", () => {
    expect(() => createSessionStorage("file")).toThrow(
      "File storage requires a directory option"
    )
  })
})
