/**
 * Cost tracker implementation
 * @module formagent-sdk/cost/tracker
 */

import type { UsageInfo } from "../types/core"
import type {
  CostTracker,
  CostTrackerOptions,
  UsageRecord,
  AggregatedUsage,
  PricingConfig,
  ModelPricing,
} from "../types/cost"
import { DEFAULT_PRICING } from "../types/cost"

/**
 * Cost tracker implementation
 *
 * Tracks token usage and calculates costs across API calls.
 * Supports message ID deduplication to prevent double-counting.
 *
 * @example
 * ```ts
 * const tracker = new CostTrackerImpl()
 *
 * // Process API response
 * tracker.processMessage("msg-123", "claude-3-sonnet", {
 *   input_tokens: 1000,
 *   output_tokens: 500,
 * })
 *
 * // Get total cost
 * console.log(`Total cost: $${tracker.getTotalCost().toFixed(4)}`)
 * ```
 */
export class CostTrackerImpl implements CostTracker {
  /**
   * Pricing configuration
   */
  private pricing: PricingConfig

  /**
   * Enable deduplication
   */
  private deduplication: boolean

  /**
   * Maximum records to keep
   */
  private maxRecords: number

  /**
   * Usage records
   */
  private records: UsageRecord[] = []

  /**
   * Processed message IDs (for deduplication)
   */
  private processedIds: Set<string> = new Set()

  constructor(options: CostTrackerOptions = {}) {
    this.pricing = options.pricing ?? DEFAULT_PRICING
    this.deduplication = options.deduplication ?? true
    this.maxRecords = options.maxRecords ?? 10000
  }

  /**
   * Process a message and track its usage
   *
   * @param messageId - Unique message ID
   * @param model - Model used
   * @param usage - Usage information
   * @param sessionId - Optional session ID
   * @returns Usage record
   */
  processMessage(
    messageId: string,
    model: string,
    usage: UsageInfo,
    sessionId?: string
  ): UsageRecord {
    // Check for duplicates
    if (this.deduplication && this.processedIds.has(messageId)) {
      // Return existing record
      const existing = this.records.find((r) => r.messageId === messageId)
      if (existing) {
        return existing
      }
    }

    // Calculate cost
    const cost = this.calculateCost(model, usage)

    // Create record
    const record: UsageRecord = {
      messageId,
      model,
      usage,
      cost,
      timestamp: Date.now(),
      sessionId,
    }

    // Track message ID
    if (this.deduplication) {
      this.processedIds.add(messageId)
    }

    // Add record
    this.records.push(record)

    // Enforce max records limit
    if (this.records.length > this.maxRecords) {
      const removed = this.records.shift()
      if (removed && this.deduplication) {
        this.processedIds.delete(removed.messageId)
      }
    }

    return record
  }

  /**
   * Calculate cost for given usage
   *
   * @param model - Model used
   * @param usage - Usage information
   * @returns Cost in USD
   */
  calculateCost(model: string, usage: UsageInfo): number {
    const pricing = this.getPricingForModel(model)

    let cost = 0

    // Input tokens
    cost += (usage.input_tokens / 1_000_000) * pricing.inputPricePerMillion

    // Output tokens
    cost += (usage.output_tokens / 1_000_000) * pricing.outputPricePerMillion

    // Cache creation tokens
    if (usage.cache_creation_input_tokens && pricing.cacheWritePricePerMillion) {
      cost +=
        (usage.cache_creation_input_tokens / 1_000_000) * pricing.cacheWritePricePerMillion
    }

    // Cache read tokens
    if (usage.cache_read_input_tokens && pricing.cacheReadPricePerMillion) {
      cost +=
        (usage.cache_read_input_tokens / 1_000_000) * pricing.cacheReadPricePerMillion
    }

    return cost
  }

  /**
   * Get total usage across all tracked messages
   *
   * @returns Aggregated usage
   */
  getTotalUsage(): AggregatedUsage {
    const result: AggregatedUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUsd: 0,
      callCount: 0,
      byModel: {},
      bySession: {},
    }

    for (const record of this.records) {
      // Total counts
      result.totalInputTokens += record.usage.input_tokens
      result.totalOutputTokens += record.usage.output_tokens
      result.totalCacheCreationTokens += record.usage.cache_creation_input_tokens ?? 0
      result.totalCacheReadTokens += record.usage.cache_read_input_tokens ?? 0
      result.totalCostUsd += record.cost
      result.callCount++

      // By model
      if (!result.byModel[record.model]) {
        result.byModel[record.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          calls: 0,
        }
      }
      result.byModel[record.model].inputTokens += record.usage.input_tokens
      result.byModel[record.model].outputTokens += record.usage.output_tokens
      result.byModel[record.model].cost += record.cost
      result.byModel[record.model].calls++

      // By session
      if (record.sessionId) {
        if (!result.bySession![record.sessionId]) {
          result.bySession![record.sessionId] = {
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            calls: 0,
          }
        }
        result.bySession![record.sessionId].inputTokens += record.usage.input_tokens
        result.bySession![record.sessionId].outputTokens += record.usage.output_tokens
        result.bySession![record.sessionId].cost += record.cost
        result.bySession![record.sessionId].calls++
      }
    }

    return result
  }

  /**
   * Get total cost (USD)
   *
   * @returns Total cost in USD
   */
  getTotalCost(): number {
    return this.records.reduce((sum, r) => sum + r.cost, 0)
  }

  /**
   * Get usage for a specific session
   *
   * @param sessionId - Session ID
   * @returns Aggregated usage for session or undefined
   */
  getSessionUsage(sessionId: string): AggregatedUsage | undefined {
    const sessionRecords = this.records.filter((r) => r.sessionId === sessionId)

    if (sessionRecords.length === 0) {
      return undefined
    }

    const result: AggregatedUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUsd: 0,
      callCount: 0,
      byModel: {},
    }

    for (const record of sessionRecords) {
      result.totalInputTokens += record.usage.input_tokens
      result.totalOutputTokens += record.usage.output_tokens
      result.totalCacheCreationTokens += record.usage.cache_creation_input_tokens ?? 0
      result.totalCacheReadTokens += record.usage.cache_read_input_tokens ?? 0
      result.totalCostUsd += record.cost
      result.callCount++

      if (!result.byModel[record.model]) {
        result.byModel[record.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          calls: 0,
        }
      }
      result.byModel[record.model].inputTokens += record.usage.input_tokens
      result.byModel[record.model].outputTokens += record.usage.output_tokens
      result.byModel[record.model].cost += record.cost
      result.byModel[record.model].calls++
    }

    return result
  }

  /**
   * Get all usage records
   *
   * @returns Array of usage records
   */
  getRecords(): UsageRecord[] {
    return [...this.records]
  }

  /**
   * Clear all tracked usage
   */
  clear(): void {
    this.records = []
    this.processedIds.clear()
  }

  /**
   * Reset tracking for a session
   *
   * @param sessionId - Session ID to reset
   */
  resetSession(sessionId: string): void {
    const toRemove = this.records.filter((r) => r.sessionId === sessionId)
    for (const record of toRemove) {
      if (this.deduplication) {
        this.processedIds.delete(record.messageId)
      }
    }
    this.records = this.records.filter((r) => r.sessionId !== sessionId)
  }

  /**
   * Get pricing for a specific model
   *
   * @param model - Model name
   * @returns Model pricing
   */
  private getPricingForModel(model: string): ModelPricing {
    // Check model-specific pricing
    if (this.pricing.models?.[model]) {
      return this.pricing.models[model]
    }

    // Check provider-specific pricing
    if (this.pricing.providers) {
      for (const [_provider, models] of Object.entries(this.pricing.providers)) {
        if (models) {
          // Try exact match
          if (models[model]) {
            return models[model]
          }

          // Try prefix match (e.g., "claude-3-sonnet" matches "claude-3-sonnet-20240229")
          for (const [modelPrefix, pricing] of Object.entries(models)) {
            if (model.startsWith(modelPrefix)) {
              return pricing
            }
          }
        }
      }
    }

    // Fall back to default
    return this.pricing.default ?? {
      inputPricePerMillion: 1.0,
      outputPricePerMillion: 3.0,
    }
  }
}

/**
 * Create a new cost tracker
 *
 * @param options - Cost tracker options
 * @returns CostTracker instance
 */
export function createCostTracker(options?: CostTrackerOptions): CostTracker {
  return new CostTrackerImpl(options)
}

/**
 * Default global cost tracker
 */
export const globalCostTracker = new CostTrackerImpl()
