// @ts-nocheck
/**
 * @deprecated This is legacy code. Use the new Session API streaming instead.
 */
import type { AgentChunk, AgentEventEmitter, LLMResponseChunk, ToolEvent, AssistantMessage } from "../types"

export class StreamProcessor {
  private emitter: AgentEventEmitter
  private currentText = ""
  private currentReasoning = ""

  constructor(emitter: AgentEventEmitter) {
    this.emitter = emitter
  }

  async processChunk(chunk: LLMResponseChunk): Promise<void> {
    switch (chunk.type) {
      case "text_delta": {
        this.currentText += chunk.delta || ""
        this.emitter.emit("chunk", {
          type: "text",
          delta: chunk.delta || "",
          content: this.currentText,
        })
        break
      }

      case "text_end": {
        this.emitter.emit("chunk", {
          type: "text",
          delta: "",
          content: this.currentText.trimEnd(),
        })
        this.currentText = ""
        break
      }

      case "tool_call_start": {
        this.currentText = ""
        break
      }

      case "tool_call": {
        if (chunk.toolCall) {
          this.emitter.emit("tool_call", {
            type: "start",
            toolId: chunk.toolCall.id,
            toolName: chunk.toolCall.name,
            input: chunk.toolCall.input,
          })
          this.emitter.emit("chunk", {
            type: "tool_call",
            toolName: chunk.toolCall.name,
            input: chunk.toolCall.input,
            callId: chunk.toolCall.id,
          })
        }
        break
      }

      case "tool_result": {
        this.emitter.emit("tool_call", {
          type: "result",
          toolId: chunk.toolCallId,
          result: {
            output: chunk.output,
          },
        })
        this.emitter.emit("chunk", {
          type: "tool_result",
          callId: chunk.toolCallId,
          output: chunk.output,
          error: chunk.error,
        })
        break
      }

      case "finish": {
        if (chunk.finishReason) {
          this.emitter.emit("chunk", {
            type: "complete",
            finishReason: chunk.finishReason,
          })
        }
        break
      }

      case "start": {
        break
      }
    }
  }

  reset(): void {
    this.currentText = ""
    this.currentReasoning = ""
  }

  getText(): string {
    return this.currentText
  }

  getReasoning(): string {
    return this.currentReasoning
  }
}
