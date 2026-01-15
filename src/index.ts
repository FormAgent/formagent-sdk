/**
 * formagent-sdk
 *
 * Core AI Agent framework with Claude SDK compatible API
 *
 * @packageDocumentation
 */

// Types (Claude SDK compatible)
export * from "./types"
export * from "./types/index"

// Utilities
export * from "./utils"

// Output truncation
export {
  truncateOutput,
  truncateToolOutput,
  needsTruncation,
  cleanupTruncatedOutputs,
  TRUNCATION_DEFAULTS,
} from "./utils/truncation"
export type {
  TruncationConfig,
  TruncationResult,
} from "./utils/truncation"

// Session management
export * from "./session"

// Session compaction
export {
  SessionCompactor,
  createCompactor,
  pruneToolOutputs,
  compactMessages,
  needsCompaction,
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  generateSummaryPrompt,
  createSummaryMessage,
  COMPACTION_DEFAULTS,
} from "./session/compaction"
export type {
  CompactionConfig,
  CompactionResult,
  TokenEstimate,
} from "./session/compaction"

// Public API (Claude SDK compatible)
export {
  createSession,
  resumeSession,
  forkSession,
  prompt,
  query,
  closeAllSessions,
  setDefaultProvider,
  setDefaultStorage,
} from "./api"

// Session Storage implementations
export {
  MemorySessionStorage,
  FileSessionStorage,
  createSessionStorage,
} from "./session/storage"

// Tools
export * from "./tools"

// System prompts
export * from "./prompt"

// Cost tracking
export * from "./cost"

// LLM Providers
export * from "./llm"

// Hooks
export * from "./hooks"

// Legacy exports (for backward compatibility)
export * from "./skills/loader"
export * from "./loop/agent"
export * from "./stream/processor"

// Named exports
export { Agent } from "./loop/agent"
export { ToolRegistry } from "./tools/registry"
export { SkillLoader } from "./skills/loader"
export { OpenAIProvider } from "./llm/openai"
export { GeminiProvider } from "./llm/gemini"
export { StreamProcessor } from "./stream/processor"
export { AgentEventEmitter } from "./types"

// Type imports for Agent creation
import type { AgentConfig } from "./types"
import { Agent } from "./loop/agent"

/**
 * Create a new Agent instance
 *
 * @param config - Agent configuration
 * @returns New Agent instance
 *
 * @example
 * ```ts
 * const agent = createAgent({
 *   id: "my-agent",
 *   name: "My Agent",
 *   llmConfig: {
 *     providerId: "openai",
 *     modelId: "gpt-4-turbo",
 *     apiKey: process.env.OPENAI_API_KEY,
 *   },
 * })
 * ```
 */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}

// Re-export type utilities
export type {
  // Core types
  ContentBlock,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  SDKMessage,
  UserMessage as SDKUserMessage,
  AssistantMessage as SDKAssistantMessage,
  SystemMessage as SDKSystemMessage,
  UsageInfo,
  ExtendedUsageInfo,
  ModelConfig,
  StopReason,
  StreamEvent,
  // Session types
  Session,
  SessionConfig,
  SessionState,
  SessionStorage,
  SessionEvent,
  SessionManager,
  CreateSessionOptions,
  // Query types
  QueryInput,
  QueryOptions,
  QueryResult,
  PromptOptions,
  PromptResult,
  // Tool types
  ToolDefinition as SDKToolDefinition,
  ToolContext as SDKToolContext,
  ToolOutput,
  ToolRegistry as SDKToolRegistry,
  MCPServer,
  MCPToolInfo,
  CreateMCPServerOptions,
  ToolEvent as SDKToolEvent,
  // Skill types
  SkillDefinition as SDKSkillDefinition,
  SkillLoader as SDKSkillLoader,
  SkillMetadata,
  // Prompt types
  SystemPromptConfig,
  SystemPromptPreset,
  SettingSourcesConfig,
  SystemPromptBuilder,
  ClaudeMdContent,
  ClaudeMdLoader,
  // Provider types
  LLMProvider as SDKLLMProvider,
  LLMRequest,
  LLMResponse as SDKLLMResponse,
  LLMStreamResponse,
  ProviderRegistry,
  // Cost types
  CostTracker,
  PricingConfig,
  ModelPricing,
  UsageRecord,
  AggregatedUsage,
  // Hooks types
  HooksConfig,
  HookCallback,
  HookMatcher,
  HookInput,
  HookOutput,
  HookContext,
  HookEventName,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PermissionDecision,
  OutputFormat,
} from "./types/index"
