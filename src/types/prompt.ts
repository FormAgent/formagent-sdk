/**
 * System prompt type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/prompt
 */

// === System Prompt Configuration ===

/**
 * System prompt preset types
 */
export type SystemPromptPreset = "claude_code" | "default" | "minimal" | "custom"

/**
 * System prompt configuration (Claude SDK compatible)
 */
export interface SystemPromptConfig {
  /** Use a preset system prompt */
  preset?: SystemPromptPreset
  /** Custom system prompt (when preset is "custom" or not set) */
  custom?: string
  /** Content to prepend before the preset */
  prepend?: string
  /** Content to append after the preset */
  append?: string
  /** Setting sources for CLAUDE.md loading */
  settingSources?: SettingSourcesConfig
}

/**
 * Setting sources configuration (controls which CLAUDE.md files to load)
 */
export interface SettingSourcesConfig {
  /** Load user-level CLAUDE.md (~/.claude/CLAUDE.md) */
  user?: boolean
  /** Load project-level CLAUDE.md */
  project?: boolean
  /** Load enterprise CLAUDE.md */
  enterprise?: boolean
  /** Additional paths to load */
  additionalPaths?: string[]
}

// === System Prompt Builder Types ===

/**
 * System prompt builder interface
 */
export interface SystemPromptBuilder {
  /**
   * Build the complete system prompt
   * @param config - System prompt configuration
   * @param context - Build context
   */
  build(config: SystemPromptConfig, context?: SystemPromptContext): Promise<string>

  /**
   * Get a preset system prompt
   * @param preset - Preset name
   */
  getPreset(preset: SystemPromptPreset): string

  /**
   * Register a custom preset
   * @param name - Preset name
   * @param content - Preset content
   */
  registerPreset(name: string, content: string): void
}

/**
 * Context for system prompt building
 */
export interface SystemPromptContext {
  /** Working directory */
  cwd?: string
  /** Tool names available in session */
  toolNames?: string[]
  /** Skill names available in session */
  skillNames?: string[]
  /** Current date/time */
  timestamp?: number
  /** User information */
  user?: {
    name?: string
    timezone?: string
  }
  /** Environment information */
  environment?: {
    platform?: string
    shell?: string
    editor?: string
  }
}

// === CLAUDE.md Types ===

/**
 * CLAUDE.md file content
 */
export interface ClaudeMdContent {
  /** Raw content */
  raw: string
  /** Parsed sections */
  sections?: ClaudeMdSection[]
  /** File path */
  filePath: string
  /** File type */
  type: "user" | "project" | "enterprise"
}

/**
 * CLAUDE.md section
 */
export interface ClaudeMdSection {
  /** Section heading */
  heading: string
  /** Section level (1-6) */
  level: number
  /** Section content */
  content: string
}

/**
 * CLAUDE.md loader interface
 */
export interface ClaudeMdLoader {
  /**
   * Load project-level CLAUDE.md
   * @param cwd - Working directory
   */
  loadProjectClaudeMd(cwd: string): Promise<ClaudeMdContent | undefined>

  /**
   * Load user-level CLAUDE.md
   */
  loadUserClaudeMd(): Promise<ClaudeMdContent | undefined>

  /**
   * Load all CLAUDE.md files according to settings
   * @param config - Setting sources configuration
   * @param cwd - Working directory
   */
  loadAll(config: SettingSourcesConfig, cwd?: string): Promise<ClaudeMdContent[]>

  /**
   * Merge multiple CLAUDE.md contents into one string
   * @param contents - CLAUDE.md contents to merge
   */
  merge(contents: ClaudeMdContent[]): string
}

// === Preset Content Types ===

/**
 * Information about a system prompt preset
 */
export interface PresetInfo {
  /** Preset name */
  name: SystemPromptPreset
  /** Preset description */
  description: string
  /** Character count of preset content */
  length: number
  /** Whether this is a built-in preset */
  builtIn: boolean
}

/**
 * Built-in preset definitions
 */
export interface BuiltInPresets {
  /** Claude Code preset (full agent behavior) */
  claude_code: string
  /** Default preset (balanced) */
  default: string
  /** Minimal preset (bare minimum) */
  minimal: string
}
