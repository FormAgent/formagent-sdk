/**
 * Provider resolver for automatic provider selection
 * @module formagent-sdk/llm/resolver
 */

import type { LLMProvider, ProviderRegistry } from "../types/provider"
import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { GeminiProvider } from "./gemini"

/**
 * Model pattern matching rule
 */
interface ModelPattern {
  /** Pattern to match (regex) */
  pattern: RegExp
  /** Provider ID to use */
  providerId: string
}

/**
 * Default model patterns for auto-resolution
 */
const DEFAULT_MODEL_PATTERNS: ModelPattern[] = [
  // Anthropic models
  { pattern: /^claude-/, providerId: "anthropic" },

  // OpenAI models
  { pattern: /^gpt-4/, providerId: "openai" },
  { pattern: /^gpt-3\.5/, providerId: "openai" },
  { pattern: /^o1/, providerId: "openai" },
  { pattern: /^chatgpt/, providerId: "openai" },

  // Gemini models
  { pattern: /^gemini-/, providerId: "gemini" },

  // DeepSeek models
  { pattern: /^deepseek-/, providerId: "deepseek" },

  // Ollama models (local)
  { pattern: /^llama/, providerId: "ollama" },
  { pattern: /^mistral/, providerId: "ollama" },
  { pattern: /^codellama/, providerId: "ollama" },
]

/**
 * Provider resolver implementation
 *
 * Automatically selects the appropriate provider based on model name.
 *
 * @example
 * ```ts
 * const resolver = new ProviderResolver()
 *
 * // Register providers
 * resolver.register(new AnthropicProvider({ apiKey: "..." }))
 * resolver.register(new OpenAIProvider({ apiKey: "..." }))
 *
 * // Auto-resolve provider for model
 * const provider = resolver.resolveProvider("claude-3-sonnet")
 * // Returns AnthropicProvider
 *
 * const provider2 = resolver.resolveProvider("gpt-4-turbo")
 * // Returns OpenAIProvider
 * ```
 */
export class ProviderResolver implements ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map()
  private patterns: ModelPattern[] = [...DEFAULT_MODEL_PATTERNS]
  private defaultProvider?: LLMProvider

  /**
   * Register a provider
   *
   * @param provider - Provider to register
   */
  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider)
  }

  /**
   * Unregister a provider
   *
   * @param providerId - Provider ID to unregister
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId)
    if (this.defaultProvider?.id === providerId) {
      this.defaultProvider = undefined
    }
  }

  /**
   * Get a provider by ID
   *
   * @param providerId - Provider ID
   * @returns Provider or undefined
   */
  get(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all registered providers
   *
   * @returns Array of providers
   */
  getAll(): LLMProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Resolve provider for a model
   *
   * @param model - Model identifier
   * @returns Provider or undefined
   */
  resolveProvider(model: string): LLMProvider | undefined {
    // First, check if any registered provider explicitly supports this model
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(model)) {
        return provider
      }
    }

    // Then, use pattern matching
    for (const { pattern, providerId } of this.patterns) {
      if (pattern.test(model)) {
        const provider = this.providers.get(providerId)
        if (provider) {
          return provider
        }
      }
    }

    // Fall back to default provider
    return this.defaultProvider
  }

  /**
   * Set the default provider
   *
   * Used when no provider can be resolved for a model.
   *
   * @param provider - Default provider
   */
  setDefaultProvider(provider: LLMProvider): void {
    this.defaultProvider = provider
    // Also register if not already registered
    if (!this.providers.has(provider.id)) {
      this.register(provider)
    }
  }

  /**
   * Add a custom pattern for model resolution
   *
   * @param pattern - Regex pattern
   * @param providerId - Provider ID to use
   */
  addPattern(pattern: RegExp, providerId: string): void {
    this.patterns.unshift({ pattern, providerId })
  }

  /**
   * Remove a pattern by provider ID
   *
   * @param providerId - Provider ID to remove patterns for
   */
  removePatterns(providerId: string): void {
    this.patterns = this.patterns.filter((p) => p.providerId !== providerId)
  }

  /**
   * Get provider ID for a model (without getting the provider instance)
   *
   * @param model - Model identifier
   * @returns Provider ID or undefined
   */
  getProviderIdForModel(model: string): string | undefined {
    // Check explicit support first
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(model)) {
        return provider.id
      }
    }

    // Pattern matching
    for (const { pattern, providerId } of this.patterns) {
      if (pattern.test(model)) {
        return providerId
      }
    }

    return this.defaultProvider?.id
  }

  /**
   * Check if a model can be resolved
   *
   * @param model - Model identifier
   * @returns True if provider can be found
   */
  canResolve(model: string): boolean {
    return this.resolveProvider(model) !== undefined
  }

  /**
   * List all supported model patterns
   *
   * @returns Array of pattern descriptions
   */
  listPatterns(): { pattern: string; providerId: string }[] {
    return this.patterns.map((p) => ({
      pattern: p.pattern.toString(),
      providerId: p.providerId,
    }))
  }
}

/**
 * Create a provider resolver with default providers
 *
 * @param config - Provider configurations
 * @returns ProviderResolver instance
 */
export function createProviderResolver(config: {
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  defaultProviderId?: string
}): ProviderResolver {
  const resolver = new ProviderResolver()

  // Register Anthropic provider if API key provided
  if (config.anthropicApiKey) {
    const anthropic = new AnthropicProvider({
      apiKey: config.anthropicApiKey,
    })
    resolver.register(anthropic)

    if (config.defaultProviderId === "anthropic") {
      resolver.setDefaultProvider(anthropic)
    }
  }

  // Register OpenAI provider if API key provided
  if (config.openaiApiKey) {
    const openai = new OpenAIProvider({
      apiKey: config.openaiApiKey,
    })
    resolver.register(openai)

    if (config.defaultProviderId === "openai") {
      resolver.setDefaultProvider(openai)
    }
  }

  // Register Gemini provider if API key provided
  if (config.geminiApiKey) {
    const gemini = new GeminiProvider({
      apiKey: config.geminiApiKey,
    })
    resolver.register(gemini)

    if (config.defaultProviderId === "gemini") {
      resolver.setDefaultProvider(gemini)
    }
  }

  return resolver
}

/**
 * Default global provider resolver
 */
export const defaultProviderResolver = new ProviderResolver()
