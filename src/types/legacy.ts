/**
 * Legacy type definitions for backward compatibility
 * Maps old type names to new Claude SDK compatible types
 *
 * @deprecated Use the new types from "./core" and other modules
 * @module formagent-sdk/types/legacy
 */

import { EventEmitter } from "events"
import type {
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock as NewToolResultBlock,
  UsageInfo,
  SDKMessage,
  ModelConfig,
} from "./core"
import type {
  ToolDefinition as NewToolDefinition,
  ToolContext as NewToolContext,
  ToolOutput,
  ToolEvent as NewToolEvent,
} from "./tool"
import type { SkillDefinition as NewSkillDefinition } from "./skill"

// === Legacy Message Types ===

/** @deprecated Use MessageRole from "./core" */
export type MessageRole = "user" | "assistant" | "system"

/** @deprecated Use SDKMessage from "./core" */
export interface BaseMessage {
  id: string
  role: MessageRole
  timestamp: number
}

/** @deprecated Use UserMessage from "./core" */
export interface UserMessage extends BaseMessage {
  role: "user"
  content: MessageContent[]
}

/** @deprecated Use AssistantMessage from "./core" */
export interface AssistantMessage extends BaseMessage {
  role: "assistant"
  content: MessageContent[]
  finishReason?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

/** @deprecated Use SystemMessage from "./core" */
export interface SystemMessage extends BaseMessage {
  role: "system"
  content: string
}

/** @deprecated Use SDKMessage from "./core" */
export type Message = UserMessage | AssistantMessage | SystemMessage

/** @deprecated Use ContentBlock from "./core" */
export type MessageContent = TextContent | ImageContent | ToolCallContent | ToolResultContent

/** @deprecated Use TextBlock from "./core" */
export interface TextContent {
  type: "text"
  text: string
}

/** @deprecated Use ImageBlock from "./core" */
export interface ImageContent {
  type: "image"
  url: string
  mimeType?: string
}

/** @deprecated Use ToolUseBlock from "./core" */
export interface ToolCallContent {
  type: "tool_call"
  toolId: string
  toolName: string
  input: Record<string, any>
  callId: string
  status?: "pending" | "running" | "completed" | "error"
  output?: string
  error?: string
}

/** @deprecated Use ToolResultBlock from "./core" */
export interface ToolResultContent {
  type: "tool_result"
  toolCallId: string
  output: string
  error?: string
}

// === Legacy Tool Types ===

/** @deprecated Use ToolDefinition from "./tool" */
export interface ToolDefinition {
  id: string
  name: string
  description: string
  parameters: Record<string, any>
  execute: (input: Record<string, any>, context: ToolContext) => Promise<ToolResult>
}

/** @deprecated Use ToolContext from "./tool" */
export interface ToolContext {
  abortSignal: AbortSignal
  sessionId: string
  metadata?: (data: Record<string, any>) => void
  notify?: (event: ToolEvent) => void
}

/** @deprecated Use ToolOutput from "./tool" */
export interface ToolResult {
  output: string
  metadata?: Record<string, any>
  attachments?: Attachment[]
}

/** @deprecated Will be removed */
export interface Attachment {
  id: string
  type: string
  url?: string
  content?: string
  filename?: string
}

/** @deprecated Use ToolEvent from "./tool" */
export type ToolEvent =
  | { type: "start"; toolId: string; toolName: string; input: Record<string, any> }
  | { type: "progress"; toolId: string; progress: number }
  | { type: "result"; toolId: string; result: ToolResult }
  | { type: "error"; toolId: string; error: string }

// === Legacy Skill Types ===

/** @deprecated Use SkillDefinition from "./skill" */
export interface SkillDefinition {
  id: string
  name: string
  description: string
  content: string
  metadata?: Record<string, any>
}

// === Legacy LLM Types ===

/** @deprecated Use ModelConfig from "./core" */
export interface LLMConfig {
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
}

/** @deprecated Use SDKMessage from "./core" */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | Array<LLMContentBlock>
}

/** @deprecated Use ContentBlock from "./core" */
export interface LLMContentBlock {
  type: "text" | "image" | "tool_call" | "tool_result"
  text?: string
  image?: { url: string; mimeType?: string }
  toolCall?: { id: string; name: string; input: Record<string, any> }
  toolResult?: { toolCallId: string; output: string }
}

/** @deprecated Use StreamEvent from "./core" */
export interface LLMResponseChunk {
  type: "start" | "text_delta" | "text_end" | "tool_call_start" | "tool_call" | "tool_result" | "finish"
  delta?: string
  toolCall?: {
    id: string
    name: string
    input: Record<string, any>
  }
  finishReason?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

/** @deprecated Use LLMStreamResponse from "./provider" */
export interface LLMStream {
  [Symbol.asyncIterator](): AsyncIterator<LLMResponseChunk>
}

// === Legacy Agent Types ===

/** @deprecated Use SessionConfig from "./session" */
export interface AgentConfig {
  id: string
  name: string
  description?: string
  systemPrompt?: string
  llmConfig: LLMConfig
  tools?: ToolDefinition[]
  skills?: SkillDefinition[]
  maxSteps?: number
  enableDoomLoopDetection?: boolean
  doomLoopThreshold?: number
  enableCompaction?: boolean
  compactionThreshold?: number
}

/** @deprecated Will be removed */
export interface AgentInput {
  sessionId: string
  userMessage: UserMessage
  abortSignal: AbortSignal
}

/** @deprecated Use QueryOptions from "./query" */
export interface AgentOptions {
  onChunk?: (chunk: AgentChunk) => void | Promise<void>
  onToolCall?: (event: ToolEvent) => void | Promise<void>
  onMessageComplete?: (message: AssistantMessage) => void | Promise<void>
  onError?: (error: Error) => void | Promise<void>
  onComplete?: (result: AgentResult) => void | Promise<void>
}

/** @deprecated Use SessionEvent from "./session" */
export type AgentChunk =
  | { type: "text"; delta: string; content: string }
  | { type: "tool_call"; toolName: string; input: Record<string, any>; callId: string }
  | { type: "tool_result"; callId: string; output: string; error?: string }
  | { type: "reasoning"; delta: string; content: string }
  | { type: "error"; error: Error }

/** @deprecated Use QueryResult from "./query" */
export interface AgentResult {
  sessionId: string
  messages: Message[]
  finalMessage?: AssistantMessage
  finishReason: string
  totalTokens: {
    input: number
    output: number
    total: number
  }
  toolCalls: number
  steps: number
}

// === Legacy Provider Interface ===

/** @deprecated Use LLMProvider from "./provider" */
export interface LLMProvider {
  id: string
  name: string
  stream(config: {
    messages: LLMMessage[]
    tools: ToolDefinition[]
    llmConfig: LLMConfig
    abortSignal: AbortSignal
    onChunk?: (chunk: LLMResponseChunk) => void
  }): Promise<LLMStream>
}

// === Legacy Registry Interfaces ===

/** @deprecated Use ToolRegistry from "./tool" */
export interface ToolRegistry {
  register(tool: ToolDefinition): void
  unregister(toolId: string): void
  get(toolId: string): ToolDefinition | undefined
  getAll(): ToolDefinition[]
  clear(): void
}

/** @deprecated Use SkillLoader from "./skill" */
export interface SkillLoader {
  load(skillId: string): Promise<SkillDefinition | undefined>
  loadAll(): Promise<SkillDefinition[]>
  search(query?: string): Promise<SkillDefinition[]>
}

// === Legacy Event Emitter ===

/** @deprecated Will be removed, use native EventEmitter with proper typing */
export interface IAgentEventEmitter {
  on(event: "chunk", listener: (chunk: AgentChunk) => void): this
  on(event: "tool_call", listener: (toolEvent: ToolEvent) => void): this
  on(event: "message_complete", listener: (message: AssistantMessage) => void): this
  on(event: "error", listener: (error: Error) => void): this
  on(event: "complete", listener: (result: AgentResult) => void): this
  on(event: string, listener: (...args: any[]) => void): this

  emit(event: "chunk", chunk: AgentChunk): boolean
  emit(event: "tool_call", toolEvent: ToolEvent): boolean
  emit(event: "message_complete", message: AssistantMessage): boolean
  emit(event: "error", error: Error): boolean
  emit(event: "complete", result: AgentResult): boolean
  emit(event: string, ...args: any[]): boolean
}

/** @deprecated Will be removed, use native EventEmitter with proper typing */
export class AgentEventEmitter extends EventEmitter implements IAgentEventEmitter {
  on(event: "chunk", listener: (chunk: AgentChunk) => void): this
  on(event: "tool_call", listener: (toolEvent: ToolEvent) => void): this
  on(event: "message_complete", listener: (message: AssistantMessage) => void): this
  on(event: "error", listener: (error: Error) => void): this
  on(event: "complete", listener: (result: AgentResult) => void): this
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  emit(event: "chunk", chunk: AgentChunk): boolean
  emit(event: "tool_call", toolEvent: ToolEvent): boolean
  emit(event: "message_complete", message: AssistantMessage): boolean
  emit(event: "error", error: Error): boolean
  emit(event: "complete", result: AgentResult): boolean
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args)
  }
}
