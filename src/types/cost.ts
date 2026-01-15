/**
 * Cost tracking type definitions
 * @module formagent-sdk/types/cost
 */

import type { UsageInfo } from "./core"

// === Pricing Types ===

/**
 * Pricing per model
 */
export interface ModelPricing {
  /** Price per 1M input tokens (USD) */
  inputPricePerMillion: number
  /** Price per 1M output tokens (USD) */
  outputPricePerMillion: number
  /** Price per 1M cache write tokens (USD) */
  cacheWritePricePerMillion?: number
  /** Price per 1M cache read tokens (USD) */
  cacheReadPricePerMillion?: number
}

/**
 * Pricing configuration for multiple providers/models
 */
export interface PricingConfig {
  /** Default pricing (fallback) */
  default?: ModelPricing
  /** Provider-specific pricing */
  providers?: {
    anthropic?: Record<string, ModelPricing>
    openai?: Record<string, ModelPricing>
    deepseek?: Record<string, ModelPricing>
    [provider: string]: Record<string, ModelPricing> | undefined
  }
  /** Model-specific pricing (overrides provider pricing) */
  models?: Record<string, ModelPricing>
}

// === Usage Record Types ===

/**
 * Usage record for a single API call
 */
export interface UsageRecord {
  /** Unique message ID (for deduplication) */
  messageId: string
  /** Model used */
  model: string
  /** Usage information */
  usage: UsageInfo
  /** Calculated cost (USD) */
  cost: number
  /** Timestamp */
  timestamp: number
  /** Session ID */
  sessionId?: string
}

/**
 * Aggregated usage statistics
 */
export interface AggregatedUsage {
  /** Total input tokens */
  totalInputTokens: number
  /** Total output tokens */
  totalOutputTokens: number
  /** Total cache creation tokens */
  totalCacheCreationTokens: number
  /** Total cache read tokens */
  totalCacheReadTokens: number
  /** Total cost (USD) */
  totalCostUsd: number
  /** Number of API calls */
  callCount: number
  /** Usage by model */
  byModel: Record<string, {
    inputTokens: number
    outputTokens: number
    cost: number
    calls: number
  }>
  /** Usage by session */
  bySession?: Record<string, {
    inputTokens: number
    outputTokens: number
    cost: number
    calls: number
  }>
}

// === Cost Tracker Types ===

/**
 * Cost tracker interface
 */
export interface CostTracker {
  /**
   * Process a message and track its usage
   * @param messageId - Unique message ID
   * @param model - Model used
   * @param usage - Usage information
   * @param sessionId - Optional session ID
   */
  processMessage(
    messageId: string,
    model: string,
    usage: UsageInfo,
    sessionId?: string
  ): UsageRecord

  /**
   * Calculate cost for given usage
   * @param model - Model used
   * @param usage - Usage information
   */
  calculateCost(model: string, usage: UsageInfo): number

  /**
   * Get total usage across all tracked messages
   */
  getTotalUsage(): AggregatedUsage

  /**
   * Get total cost (USD)
   */
  getTotalCost(): number

  /**
   * Get usage for a specific session
   * @param sessionId - Session ID
   */
  getSessionUsage(sessionId: string): AggregatedUsage | undefined

  /**
   * Get all usage records
   */
  getRecords(): UsageRecord[]

  /**
   * Clear all tracked usage
   */
  clear(): void

  /**
   * Reset tracking for a session
   * @param sessionId - Session ID to reset
   */
  resetSession(sessionId: string): void
}

// === Cost Tracker Options ===

/**
 * Options for creating a cost tracker
 */
export interface CostTrackerOptions {
  /** Pricing configuration */
  pricing?: PricingConfig
  /** Enable message ID deduplication */
  deduplication?: boolean
  /** Maximum records to keep (for memory management) */
  maxRecords?: number
}

// === Built-in Pricing ===

/**
 * Default pricing for common models (as of 2024)
 */
export const DEFAULT_PRICING: PricingConfig = {
  providers: {
    anthropic: {
      "claude-3-opus": {
        inputPricePerMillion: 15.0,
        outputPricePerMillion: 75.0,
        cacheWritePricePerMillion: 18.75,
        cacheReadPricePerMillion: 1.5,
      },
      "claude-3-sonnet": {
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        cacheWritePricePerMillion: 3.75,
        cacheReadPricePerMillion: 0.3,
      },
      "claude-3-haiku": {
        inputPricePerMillion: 0.25,
        outputPricePerMillion: 1.25,
        cacheWritePricePerMillion: 0.3,
        cacheReadPricePerMillion: 0.03,
      },
      "claude-3-5-sonnet": {
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        cacheWritePricePerMillion: 3.75,
        cacheReadPricePerMillion: 0.3,
      },
      // OpenCode Zen pricing (<=200K tier) for Claude 4.5 models
      "claude-sonnet-4.5": {
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        cacheWritePricePerMillion: 3.75,
        cacheReadPricePerMillion: 0.3,
      },
      "claude-haiku-4.5": {
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 5.0,
        cacheWritePricePerMillion: 1.25,
        cacheReadPricePerMillion: 0.1,
      },
      "claude-opus-4.5": {
        inputPricePerMillion: 5.0,
        outputPricePerMillion: 25.0,
        cacheWritePricePerMillion: 6.25,
        cacheReadPricePerMillion: 0.5,
      },
    },
    openai: {
      "gpt-4-turbo": {
        inputPricePerMillion: 10.0,
        outputPricePerMillion: 30.0,
      },
      "gpt-4o": {
        inputPricePerMillion: 5.0,
        outputPricePerMillion: 15.0,
      },
      "gpt-4o-mini": {
        inputPricePerMillion: 0.15,
        outputPricePerMillion: 0.6,
      },
      "gpt-3.5-turbo": {
        inputPricePerMillion: 0.5,
        outputPricePerMillion: 1.5,
      },
      // OpenCode Zen pricing for GPT-5 series
      "gpt-5.2": {
        inputPricePerMillion: 1.75,
        outputPricePerMillion: 14.0,
        cacheReadPricePerMillion: 0.175,
      },
      "gpt-5.1": {
        inputPricePerMillion: 1.07,
        outputPricePerMillion: 8.5,
        cacheReadPricePerMillion: 0.107,
      },
      "gpt-5.1-codex": {
        inputPricePerMillion: 1.07,
        outputPricePerMillion: 8.5,
        cacheReadPricePerMillion: 0.107,
      },
      "gpt-5.1-codex-max": {
        inputPricePerMillion: 1.25,
        outputPricePerMillion: 10.0,
        cacheReadPricePerMillion: 0.125,
      },
      "gpt-5.1-codex-mini": {
        inputPricePerMillion: 0.25,
        outputPricePerMillion: 2.0,
        cacheReadPricePerMillion: 0.025,
      },
      "gpt-5": {
        inputPricePerMillion: 1.07,
        outputPricePerMillion: 8.5,
        cacheReadPricePerMillion: 0.107,
      },
      "gpt-5-codex": {
        inputPricePerMillion: 1.07,
        outputPricePerMillion: 8.5,
        cacheReadPricePerMillion: 0.107,
      },
      "gpt-5-nano": {
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        cacheReadPricePerMillion: 0,
      },
    },
    deepseek: {
      "deepseek-chat": {
        inputPricePerMillion: 0.14,
        outputPricePerMillion: 0.28,
        cacheReadPricePerMillion: 0.014,
      },
      "deepseek-coder": {
        inputPricePerMillion: 0.14,
        outputPricePerMillion: 0.28,
        cacheReadPricePerMillion: 0.014,
      },
    },
  },
  default: {
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 3.0,
  },
}
