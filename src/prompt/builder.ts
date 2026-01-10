/**
 * System prompt builder implementation
 * @module formagent-sdk/prompt/builder
 */

import type {
  SystemPromptBuilder,
  SystemPromptConfig,
  SystemPromptContext,
  SystemPromptPreset,
  PresetInfo,
} from "../types/prompt"
import { BUILT_IN_PRESETS, getBuiltInPreset } from "./presets"

/**
 * System prompt builder implementation
 *
 * Builds complete system prompts from presets and custom content.
 *
 * @example
 * ```ts
 * const builder = new SystemPromptBuilderImpl()
 *
 * // Use a preset
 * const prompt = await builder.build({ preset: "claude_code" })
 *
 * // Use custom prompt with prepend/append
 * const customPrompt = await builder.build({
 *   preset: "default",
 *   prepend: "You are working on a TypeScript project.",
 *   append: "Always use async/await for asynchronous code.",
 * })
 * ```
 */
export class SystemPromptBuilderImpl implements SystemPromptBuilder {
  /**
   * Custom presets registered by users
   */
  private customPresets: Map<string, string> = new Map()

  /**
   * Build the complete system prompt
   *
   * @param config - System prompt configuration
   * @param context - Optional build context
   * @returns Complete system prompt string
   */
  async build(config: SystemPromptConfig, context?: SystemPromptContext): Promise<string> {
    const parts: string[] = []

    // Add prepend content
    if (config.prepend) {
      parts.push(config.prepend.trim())
    }

    // Get base content (preset or custom)
    const baseContent = this.getBaseContent(config)
    if (baseContent) {
      parts.push(baseContent.trim())
    }

    // Add context-based content
    const contextContent = this.buildContextContent(context)
    if (contextContent) {
      parts.push(contextContent.trim())
    }

    // Add append content
    if (config.append) {
      parts.push(config.append.trim())
    }

    return parts.filter(Boolean).join("\n\n")
  }

  /**
   * Get a preset system prompt by name
   *
   * @param preset - Preset name
   * @returns Preset content
   */
  getPreset(preset: SystemPromptPreset): string {
    if (preset === "custom") {
      return ""
    }

    // Check custom presets first
    const customPreset = this.customPresets.get(preset)
    if (customPreset) {
      return customPreset
    }

    // Fall back to built-in presets
    return getBuiltInPreset(preset as keyof typeof BUILT_IN_PRESETS)
  }

  /**
   * Register a custom preset
   *
   * @param name - Preset name
   * @param content - Preset content
   */
  registerPreset(name: string, content: string): void {
    this.customPresets.set(name, content)
  }

  /**
   * List all available presets
   *
   * @returns Array of preset information
   */
  listPresets(): PresetInfo[] {
    const presets: PresetInfo[] = []

    // Built-in presets
    for (const [name, content] of Object.entries(BUILT_IN_PRESETS)) {
      presets.push({
        name: name as SystemPromptPreset,
        description: this.getPresetDescription(name as SystemPromptPreset),
        length: content.length,
        builtIn: true,
      })
    }

    // Custom presets
    for (const [name, content] of this.customPresets.entries()) {
      presets.push({
        name: name as SystemPromptPreset,
        description: `Custom preset: ${name}`,
        length: content.length,
        builtIn: false,
      })
    }

    return presets
  }

  /**
   * Get base content from preset or custom config
   */
  private getBaseContent(config: SystemPromptConfig): string {
    // Custom content takes precedence
    if (config.custom) {
      return config.custom
    }

    // Get preset content
    if (config.preset) {
      return this.getPreset(config.preset)
    }

    // Default to default preset
    return this.getPreset("default")
  }

  /**
   * Build context-specific content
   */
  private buildContextContent(context?: SystemPromptContext): string {
    if (!context) {
      return ""
    }

    const parts: string[] = []

    // Add environment info
    if (context.environment || context.cwd || context.timestamp) {
      const envParts: string[] = []

      if (context.cwd) {
        envParts.push(`Working directory: ${context.cwd}`)
      }

      if (context.environment?.platform) {
        envParts.push(`Platform: ${context.environment.platform}`)
      }

      if (context.environment?.shell) {
        envParts.push(`Shell: ${context.environment.shell}`)
      }

      if (context.timestamp) {
        const date = new Date(context.timestamp)
        envParts.push(`Current date: ${date.toISOString().split("T")[0]}`)
      }

      if (envParts.length > 0) {
        parts.push(`## Environment\n${envParts.join("\n")}`)
      }
    }

    // Add available tools
    if (context.toolNames && context.toolNames.length > 0) {
      parts.push(`## Available Tools\n${context.toolNames.join(", ")}`)
    }

    // Add available skills
    if (context.skillNames && context.skillNames.length > 0) {
      parts.push(`## Available Skills\n${context.skillNames.join(", ")}`)
    }

    // Add user info
    if (context.user?.name) {
      parts.push(`## User\nName: ${context.user.name}`)
    }

    return parts.join("\n\n")
  }

  /**
   * Get description for a preset
   */
  private getPresetDescription(preset: SystemPromptPreset): string {
    switch (preset) {
      case "claude_code":
        return "Full-featured Claude Code agent behavior"
      case "default":
        return "Balanced preset for general use"
      case "minimal":
        return "Minimal instructions for simple tasks"
      case "custom":
        return "User-defined custom prompt"
      default:
        return `Preset: ${preset}`
    }
  }
}

/**
 * Create a new system prompt builder
 *
 * @returns SystemPromptBuilder instance
 */
export function createSystemPromptBuilder(): SystemPromptBuilder {
  return new SystemPromptBuilderImpl()
}

/**
 * Default system prompt builder instance
 */
export const defaultSystemPromptBuilder = new SystemPromptBuilderImpl()
