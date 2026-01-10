import { describe, expect, it } from "bun:test"
import { ToolRegistry, SkillLoader, StreamProcessor, AgentEventEmitter } from "../src/index"

describe("AgentCore", () => {
  describe("ToolRegistry", () => {
    it("should register and retrieve tools", () => {
      const registry = new ToolRegistry()
      const tool = {
        id: "test_tool",
        name: "test_tool",
        description: "A test tool",
        parameters: { type: "object", properties: {} },
        async execute(input, context) {
          return {
            output: `Tool executed with input: ${JSON.stringify(input)}`,
            metadata: {},
          }
        },
      }

      registry.register(tool)
      const retrieved = registry.get("test_tool")

      expect(retrieved).toEqual(tool)
    })

    it("should return all tools", () => {
      const registry = new ToolRegistry()

      const tool1 = {
        id: "tool1",
        name: "Tool 1",
        description: "Test tool 1",
        parameters: { type: "object", properties: {} },
        async execute(input) {
          return { output: "Tool 1 result", metadata: {} }
        },
      }

      const tool2 = {
        id: "tool2",
        name: "Tool 2",
        description: "Test tool 2",
        parameters: { type: "object", properties: {} },
        async execute(input) {
          return { output: "Tool 2 result", metadata: {} }
        },
      }

      registry.register(tool1)
      registry.register(tool2)

      const all = registry.getAll()

      expect(all).toHaveLength(2)
    })
  })

  describe("SkillLoader", () => {
    it("should register and retrieve skills", () => {
      const loader = new SkillLoader()

      const skill = {
        id: "test_skill",
        name: "Test Skill",
        description: "A test skill",
        content: "This is a test skill content",
      }

      loader.register(skill)
      const retrieved = loader.load("test_skill")

      expect(retrieved).resolves.toEqual(skill)
    })

    it("should search skills", async () => {
      const loader = new SkillLoader()

      const skill1 = {
        id: "coding",
        name: "Coding",
        description: "Help with coding tasks",
        content: "Coding assistance",
      }

      const skill2 = {
        id: "debugging",
        name: "Debugging",
        description: "Help with debugging",
        content: "Debugging assistance",
      }

      loader.register(skill1)
      loader.register(skill2)

      // Search for "coding" which matches both id and name
      const results = await loader.search("coding")

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("coding")
    })
  })

  describe("StreamProcessor", () => {
    it("should process text chunks", () => {
      const emitter = new AgentEventEmitter()
      const processor = new StreamProcessor(emitter)

      const chunks: string[] = []

      emitter.on("chunk", (chunk) => {
        if (chunk.type === "text" && chunk.delta) {
          chunks.push(chunk.delta)
        }
      })

      processor.processChunk({
        type: "text_delta",
        delta: "Hello ",
      })

      processor.processChunk({
        type: "text_delta",
        delta: "World!",
      })

      processor.processChunk({
        type: "text_end",
      })

      expect(chunks).toEqual(["Hello ", "World!"])
      // After text_end, the processor resets currentText
      expect(processor.getText()).toBe("")
    })
  })

  describe("AgentEventEmitter", () => {
    it("should emit and listen to events", () => {
      const emitter = new AgentEventEmitter()
      const events: any[] = []

      emitter.on("chunk", (event) => events.push({ event, type: "chunk" }))
      emitter.on("tool_call", (event) => events.push({ event, type: "tool_call" }))
      emitter.on("error", (event) => events.push({ event, type: "error" }))

      emitter.emit("chunk", { type: "text", delta: "test" })
      emitter.emit("tool_call", { type: "start", toolId: "test-tool" })
      emitter.emit("error", new Error("test error"))

      expect(events).toHaveLength(3)
    })
  })
})
