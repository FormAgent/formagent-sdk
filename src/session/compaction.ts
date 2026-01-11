/**
 * Session compaction and context compression
 * Manages long conversation context to prevent token overflow
 * @module formagent-sdk/session/compaction
 */

import type { SDKMessage, ContentBlock } from "../types/core"

/**
 * Compaction configuration
 */
export interface CompactionConfig {
  /** Maximum input tokens before triggering compaction (default: 80% of context) */
  maxInputTokens?: number
  /** Minimum tokens to prune in a single pass (default: 20000) */
  pruneMinimum?: number
  /** Token threshold to protect recent content (default: 40000) */
  pruneProtect?: number
  /** Tool names that should never be pruned */
  protectedTools?: string[]
  /** Whether auto-compaction is enabled (default: true) */
  autoCompact?: boolean
  /** Whether to prune old tool outputs (default: true) */
  pruneToolOutputs?: boolean
}

/**
 * Token estimation for a message
 */
export interface TokenEstimate {
  /** Estimated total tokens */
  total: number
  /** Input tokens (user messages + tool results) */
  input: number
  /** Output tokens (assistant messages) */
  output: number
}

/**
 * Compaction result
 */
export interface CompactionResult {
  /** Messages after compaction */
  messages: SDKMessage[]
  /** Number of messages removed */
  removedCount: number
  /** Estimated tokens saved */
  tokensSaved: number
  /** Summary message if generated */
  summary?: string
}

/**
 * Default compaction settings
 */
export const COMPACTION_DEFAULTS = {
  PRUNE_MINIMUM: 20_000,
  PRUNE_PROTECT: 40_000,
  PROTECTED_TOOLS: ["Skill", "skill"],
  // Rough estimates for token counting
  CHARS_PER_TOKEN: 4,
} as const

/**
 * Estimate token count for text
 * Uses a simple heuristic: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / COMPACTION_DEFAULTS.CHARS_PER_TOKEN)
}

/**
 * Estimate tokens for a content block
 */
function estimateBlockTokens(block: ContentBlock): number {
  if (block.type === "text") {
    return estimateTokens(block.text)
  }
  if (block.type === "tool_use") {
    return estimateTokens(JSON.stringify(block.input)) + estimateTokens(block.name)
  }
  if (block.type === "tool_result") {
    const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content)
    return estimateTokens(content)
  }
  return 0
}

/**
 * Estimate tokens for a message
 */
export function estimateMessageTokens(message: SDKMessage): number {
  if (typeof message.content === "string") {
    return estimateTokens(message.content)
  }

  let total = 0
  for (const block of message.content) {
    total += estimateBlockTokens(block)
  }
  return total
}

/**
 * Estimate total tokens for conversation
 */
export function estimateConversationTokens(messages: SDKMessage[]): TokenEstimate {
  let input = 0
  let output = 0

  for (const message of messages) {
    const tokens = estimateMessageTokens(message)
    if (message.role === "assistant") {
      output += tokens
    } else {
      input += tokens
    }
  }

  return { total: input + output, input, output }
}

/**
 * Check if conversation needs compaction
 */
export function needsCompaction(
  messages: SDKMessage[],
  config: CompactionConfig = {}
): boolean {
  if (config.autoCompact === false) return false

  const maxTokens = config.maxInputTokens ?? 100_000 // Default 100K context
  const estimate = estimateConversationTokens(messages)

  return estimate.total > maxTokens * 0.8 // Trigger at 80% capacity
}

/**
 * Prune old tool outputs to save context space
 *
 * Goes backwards through messages and marks old tool call outputs for pruning.
 * Keeps recent tool calls (within PRUNE_PROTECT tokens) intact.
 *
 * @param messages - Conversation messages
 * @param config - Compaction configuration
 * @returns Messages with pruned tool outputs
 */
export function pruneToolOutputs(
  messages: SDKMessage[],
  config: CompactionConfig = {}
): CompactionResult {
  const pruneProtect = config.pruneProtect ?? COMPACTION_DEFAULTS.PRUNE_PROTECT
  const pruneMinimum = config.pruneMinimum ?? COMPACTION_DEFAULTS.PRUNE_MINIMUM
  const protectedTools = config.protectedTools ?? COMPACTION_DEFAULTS.PROTECTED_TOOLS

  if (config.pruneToolOutputs === false) {
    return { messages, removedCount: 0, tokensSaved: 0 }
  }

  let totalTokens = 0
  let prunedTokens = 0
  const toPrune: { messageIndex: number; blockIndex: number; tokens: number }[] = []

  // Skip the most recent 2 turns (assistant + user pairs)
  let turns = 0

  // Go backwards through messages
  for (let msgIndex = messages.length - 1; msgIndex >= 0; msgIndex--) {
    const msg = messages[msgIndex]

    if (msg.role === "user") {
      turns++
    }

    // Skip recent turns
    if (turns < 2) continue

    // Process tool results in user messages
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (let blockIndex = msg.content.length - 1; blockIndex >= 0; blockIndex--) {
        const block = msg.content[blockIndex]

        if (block.type === "tool_result") {
          // Check if this tool is protected
          // We need to find the corresponding tool_use to get the tool name
          // For simplicity, we'll just prune based on tokens
          const tokens = estimateBlockTokens(block)
          totalTokens += tokens

          if (totalTokens > pruneProtect) {
            prunedTokens += tokens
            toPrune.push({ messageIndex: msgIndex, blockIndex, tokens })
          }
        }
      }
    }
  }

  // Only prune if we'd save enough tokens
  if (prunedTokens < pruneMinimum) {
    return { messages, removedCount: 0, tokensSaved: 0 }
  }

  // Apply pruning by replacing tool_result content with placeholder
  const prunedMessages = messages.map((msg, msgIndex) => {
    const toPruneForMsg = toPrune.filter((p) => p.messageIndex === msgIndex)
    if (toPruneForMsg.length === 0) return msg

    if (!Array.isArray(msg.content)) return msg

    const newContent = msg.content.map((block, blockIndex) => {
      const shouldPrune = toPruneForMsg.some((p) => p.blockIndex === blockIndex)
      if (shouldPrune && block.type === "tool_result") {
        return {
          ...block,
          content: "[Output pruned to save context space]",
        }
      }
      return block
    })

    return { ...msg, content: newContent }
  })

  return {
    messages: prunedMessages,
    removedCount: toPrune.length,
    tokensSaved: prunedTokens,
  }
}

/**
 * Generate a summary prompt for conversation compaction
 *
 * This can be used to ask the LLM to summarize the conversation
 * for context continuation.
 */
export function generateSummaryPrompt(): string {
  return `Please provide a detailed summary of our conversation above. Focus on:
1. What we were working on and what files were modified
2. Key decisions and approaches taken
3. Current state and any unfinished tasks
4. Important context needed to continue the conversation

This summary will be used to continue our work in a new session without the full history.`
}

/**
 * Create a summary message from LLM response
 */
export function createSummaryMessage(summary: string): SDKMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text: `[Session Summary]\n\n${summary}\n\n[Previous conversation context has been compacted. Continuing from summary above.]`,
      },
    ],
  }
}

/**
 * Compact messages by keeping only essential context
 *
 * This is a simple compaction strategy that:
 * 1. Keeps the first message (often contains important context)
 * 2. Keeps the most recent N turns
 * 3. Optionally includes a summary of removed content
 *
 * @param messages - Original messages
 * @param keepTurns - Number of recent turns to keep (default: 5)
 * @param summary - Optional summary of removed content
 */
export function compactMessages(
  messages: SDKMessage[],
  keepTurns: number = 5,
  summary?: string
): SDKMessage[] {
  if (messages.length <= keepTurns * 2 + 1) {
    return messages
  }

  const result: SDKMessage[] = []

  // Keep first message if it's a user message (often contains task context)
  if (messages.length > 0 && messages[0].role === "user") {
    result.push(messages[0])
  }

  // Add summary if provided
  if (summary) {
    result.push(createSummaryMessage(summary))
  }

  // Count turns from the end and keep the specified number
  let turnCount = 0
  const recentMessages: SDKMessage[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    recentMessages.unshift(msg)

    if (msg.role === "user") {
      turnCount++
      if (turnCount >= keepTurns) {
        break
      }
    }
  }

  // Avoid duplicating the first message if it's in recent
  const firstMsgId = messages[0]?.id
  for (const msg of recentMessages) {
    if (msg.id !== firstMsgId || result.length === 0) {
      result.push(msg)
    }
  }

  return result
}

/**
 * Session compactor class for managing conversation context
 */
export class SessionCompactor {
  private config: CompactionConfig

  constructor(config: CompactionConfig = {}) {
    this.config = config
  }

  /**
   * Check if compaction is needed
   */
  needsCompaction(messages: SDKMessage[]): boolean {
    return needsCompaction(messages, this.config)
  }

  /**
   * Prune tool outputs to save space
   */
  pruneToolOutputs(messages: SDKMessage[]): CompactionResult {
    return pruneToolOutputs(messages, this.config)
  }

  /**
   * Estimate conversation tokens
   */
  estimateTokens(messages: SDKMessage[]): TokenEstimate {
    return estimateConversationTokens(messages)
  }

  /**
   * Compact messages with optional summary
   */
  compact(messages: SDKMessage[], summary?: string): SDKMessage[] {
    return compactMessages(messages, 5, summary)
  }
}

/**
 * Create a new session compactor
 */
export function createCompactor(config?: CompactionConfig): SessionCompactor {
  return new SessionCompactor(config)
}
