/**
 * Type definitions for formagent-sdk
 *
 * This file re-exports types for backward compatibility.
 * New code should import from "./types/index" or specific modules.
 *
 * @module formagent-sdk/types
 */

// Export new Claude SDK compatible types (primary)
export * from "./types/index"

// Re-export AgentEventEmitter class (needed for existing code)
export { AgentEventEmitter } from "./types/legacy"

// Re-export legacy types directly for backward compatibility
// These are used by existing code in loop/agent.ts and other legacy modules
export type {
  // Legacy message types (used by Agent)
  BaseMessage,
  MessageRole,
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  MessageContent,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
  // Legacy tool types
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolEvent,
  Attachment,
  // Legacy skill types
  SkillDefinition,
  // Legacy LLM types
  LLMConfig,
  LLMMessage,
  LLMContentBlock,
  LLMResponseChunk,
  LLMStream,
  LLMProvider,
  // Legacy agent types
  AgentConfig,
  AgentInput,
  AgentOptions,
  AgentChunk,
  AgentResult,
  // Legacy registry types
  ToolRegistry,
  SkillLoader,
  // Legacy event emitter
  IAgentEventEmitter,
} from "./types/legacy"
