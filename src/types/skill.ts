/**
 * Skill type definitions for Claude Agent SDK compatibility
 * @module formagent-sdk/types/skill
 */

// === Skill Definition Types ===

/**
 * Skill definition (parsed from SKILL.md)
 */
export interface SkillDefinition {
  /** Skill identifier (directory name or slug) */
  id: string
  /** Display name */
  name: string
  /** Skill description */
  description: string
  /** Skill content (markdown body) */
  content: string
  /** Skill trigger patterns */
  triggers?: string[]
  /** Required tools for this skill */
  tools?: string[]
  /** Skill metadata from frontmatter */
  metadata?: SkillMetadata
  /** File path (for debugging) */
  filePath?: string
}

/**
 * Skill metadata from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Skill version */
  version?: string
  /** Skill author */
  author?: string
  /** Tags for categorization */
  tags?: string[]
  /** Dependencies on other skills */
  dependencies?: string[]
  /** Activation triggers */
  triggers?: string[]
  /** Required tools */
  tools?: string[]
  /** Additional custom metadata */
  [key: string]: unknown
}

// === Skill Loader Types ===

/**
 * Skill loader interface
 */
export interface SkillLoader {
  /**
   * Discover skills in standard locations
   * @param options - Discovery options
   */
  discover(options?: SkillDiscoveryOptions): Promise<SkillDefinition[]>

  /**
   * Load a specific skill by ID
   * @param skillId - Skill identifier
   */
  load(skillId: string): Promise<SkillDefinition | undefined>

  /**
   * Search skills by query
   * @param query - Search query
   */
  search(query?: string): Promise<SkillDefinition[]>

  /**
   * Register a skill (programmatic)
   * @param skill - Skill definition
   */
  register(skill: SkillDefinition): void

  /**
   * Unregister a skill
   * @param skillId - Skill ID to unregister
   */
  unregister(skillId: string): void

  /**
   * Get all registered skills
   */
  getAll(): SkillDefinition[]
}

/**
 * Skill discovery options
 */
export interface SkillDiscoveryOptions {
  /** Directories to scan for skills */
  directories?: string[]
  /** Include user-level skills (~/.claude/skills) */
  includeUserSkills?: boolean
  /** Include project-level skills (.claude/skills) */
  includeProjectSkills?: boolean
  /** Recursive search depth */
  maxDepth?: number
}

// === Skill Activation Types ===

/**
 * Skill activation context
 */
export interface SkillActivationContext {
  /** User message that triggered activation */
  userMessage: string
  /** Matched trigger pattern */
  matchedTrigger?: string
  /** Session context */
  sessionId: string
}

/**
 * Result of skill activation check
 */
export interface SkillActivationResult {
  /** Whether skill should be activated */
  shouldActivate: boolean
  /** Matching skill definitions */
  skills: SkillDefinition[]
  /** Content to inject into system prompt */
  systemPromptAddition?: string
}

// === Skill Manager Types ===

/**
 * Skill manager for handling skill discovery and activation
 */
export interface SkillManager extends SkillLoader {
  /**
   * Check if any skills should be activated for a message
   * @param message - User message to check
   * @param context - Activation context
   */
  checkActivation(message: string, context: SkillActivationContext): Promise<SkillActivationResult>

  /**
   * Get system prompt content for activated skills
   * @param skillIds - IDs of skills to include
   */
  getSystemPromptContent(skillIds: string[]): string

  /**
   * Refresh skill cache from disk
   */
  refresh(): Promise<void>
}

// === Skill Source Types ===

/**
 * Skill source configuration
 */
export interface SkillSource {
  /** Source type */
  type: "directory" | "url" | "inline"
  /** Path or URL */
  path?: string
  /** Inline skill definitions */
  skills?: SkillDefinition[]
  /** Whether this source is enabled */
  enabled?: boolean
}

/**
 * Skill sources configuration (similar to settingSources)
 */
export interface SkillSourcesConfig {
  /** User-level skills (~/.claude/skills) */
  userSkills?: boolean
  /** Project-level skills (.claude/skills) */
  projectSkills?: boolean
  /** Custom skill sources */
  customSources?: SkillSource[]
}
