/**
 * Skill loader implementation
 * @module formagent-sdk/skills/loader
 */

import { existsSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, dirname, basename } from "node:path"
import { homedir } from "node:os"
import type {
  SkillDefinition,
  SkillLoader as SkillLoaderInterface,
  SkillDiscoveryOptions,
  SkillMetadata,
  SkillManager,
  SkillActivationContext,
  SkillActivationResult,
} from "../types/skill"
import { parseFrontmatter } from "../utils/frontmatter"

/**
 * Default skill file name
 */
export const SKILL_FILE_NAME = "SKILL.md"

/**
 * Default user skills directory
 */
export const USER_SKILLS_DIR = ".claude/skills"

/**
 * Default project skills directory
 */
export const PROJECT_SKILLS_DIR = ".claude/skills"

/**
 * Skill loader implementation
 *
 * Discovers, loads, and manages skills from SKILL.md files.
 *
 * @example
 * ```ts
 * const loader = new SkillLoader()
 *
 * // Discover skills in default locations
 * const skills = await loader.discover()
 *
 * // Load a specific skill
 * const skill = await loader.load("pdf-generator")
 *
 * // Search skills
 * const matches = await loader.search("pdf")
 * ```
 */
export class SkillLoader implements SkillLoaderInterface, SkillManager {
  private skills: Map<string, SkillDefinition> = new Map()
  private discoveredPaths: Set<string> = new Set()
  private projectRoot?: string

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot
  }

  /**
   * Discover skills in standard locations
   *
   * Scans user skills directory and project skills directory
   * for SKILL.md files.
   *
   * @param options - Discovery options
   * @returns Array of discovered skills
   */
  async discover(options: SkillDiscoveryOptions = {}): Promise<SkillDefinition[]> {
    const {
      directories = [],
      includeUserSkills = true,
      includeProjectSkills = true,
      maxDepth = 2,
    } = options

    const allDirs: string[] = [...directories]

    // Add user skills directory
    if (includeUserSkills) {
      const userSkillsDir = join(homedir(), USER_SKILLS_DIR)
      if (existsSync(userSkillsDir)) {
        allDirs.push(userSkillsDir)
      }
    }

    // Add project skills directory
    if (includeProjectSkills && this.projectRoot) {
      const projectSkillsDir = join(this.projectRoot, PROJECT_SKILLS_DIR)
      if (existsSync(projectSkillsDir)) {
        allDirs.push(projectSkillsDir)
      }
    }

    // Scan all directories
    const skills: SkillDefinition[] = []
    for (const dir of allDirs) {
      const dirSkills = await this.scanDirectory(dir, maxDepth)
      skills.push(...dirSkills)
    }

    return skills
  }

  /**
   * Load a specific skill by ID
   *
   * @param skillId - Skill identifier
   * @returns Skill definition or undefined
   */
  async load(skillId: string): Promise<SkillDefinition | undefined> {
    // Check cache first
    if (this.skills.has(skillId)) {
      return this.skills.get(skillId)
    }

    // Try to find in discovered paths
    for (const path of this.discoveredPaths) {
      const skill = await this.parseSkillFile(path)
      if (skill && skill.id === skillId) {
        this.skills.set(skill.id, skill)
        return skill
      }
    }

    return undefined
  }

  /**
   * Search skills by query
   *
   * @param query - Search query
   * @returns Matching skills
   */
  async search(query?: string): Promise<SkillDefinition[]> {
    if (!query) {
      return this.getAll()
    }

    const lowerQuery = query.toLowerCase()
    return this.getAll().filter((skill) => {
      // Match by name
      if (skill.name.toLowerCase().includes(lowerQuery)) {
        return true
      }

      // Match by description
      if (skill.description.toLowerCase().includes(lowerQuery)) {
        return true
      }

      // Match by ID
      if (skill.id.toLowerCase().includes(lowerQuery)) {
        return true
      }

      // Match by tags
      if (skill.metadata?.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
        return true
      }

      // Match by triggers
      if (skill.triggers?.some((trigger) => trigger.toLowerCase().includes(lowerQuery))) {
        return true
      }

      return false
    })
  }

  /**
   * Register a skill (programmatic)
   *
   * @param skill - Skill definition
   */
  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill)
  }

  /**
   * Unregister a skill
   *
   * @param skillId - Skill ID to unregister
   */
  unregister(skillId: string): void {
    this.skills.delete(skillId)
  }

  /**
   * Get all registered skills
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }

  /**
   * Check if any skills should be activated for a message
   *
   * @param message - User message to check
   * @param context - Activation context
   * @returns Activation result
   */
  async checkActivation(message: string, context: SkillActivationContext): Promise<SkillActivationResult> {
    const lowerMessage = message.toLowerCase()
    const matchingSkills: SkillDefinition[] = []
    let matchedTrigger: string | undefined

    for (const skill of this.skills.values()) {
      if (skill.triggers) {
        for (const trigger of skill.triggers) {
          if (this.matchesTrigger(lowerMessage, trigger)) {
            matchingSkills.push(skill)
            matchedTrigger = trigger
            break
          }
        }
      }
    }

    if (matchingSkills.length === 0) {
      return {
        shouldActivate: false,
        skills: [],
      }
    }

    return {
      shouldActivate: true,
      skills: matchingSkills,
      systemPromptAddition: this.getSystemPromptContent(matchingSkills.map((s) => s.id)),
    }
  }

  /**
   * Get system prompt content for activated skills
   *
   * @param skillIds - IDs of skills to include
   * @returns System prompt content
   */
  getSystemPromptContent(skillIds: string[]): string {
    const parts: string[] = []

    for (const skillId of skillIds) {
      const skill = this.skills.get(skillId)
      if (skill) {
        parts.push(`## Skill: ${skill.name}`)
        parts.push(skill.content)
      }
    }

    return parts.join("\n\n")
  }

  /**
   * Refresh skill cache from disk
   */
  async refresh(): Promise<void> {
    this.skills.clear()
    await this.discover()
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear()
    this.discoveredPaths.clear()
  }

  /**
   * Scan a directory for SKILL.md files
   *
   * @param dir - Directory to scan
   * @param maxDepth - Maximum depth to scan
   * @param currentDepth - Current depth
   * @returns Array of discovered skills
   */
  private async scanDirectory(
    dir: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<SkillDefinition[]> {
    if (currentDepth > maxDepth) {
      return []
    }

    if (!existsSync(dir)) {
      return []
    }

    const skills: SkillDefinition[] = []

    try {
      const entries = readdirSync(dir)

      for (const entry of entries) {
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)

        if (stat.isDirectory()) {
          // Check for SKILL.md in this directory
          const skillFile = join(fullPath, SKILL_FILE_NAME)
          if (existsSync(skillFile)) {
            // Skip if already discovered
            if (!this.discoveredPaths.has(skillFile)) {
              const skill = await this.parseSkillFile(skillFile)
              if (skill) {
                this.skills.set(skill.id, skill)
                this.discoveredPaths.add(skillFile)
                skills.push(skill)
              }
            }
          }

          // Recurse into subdirectories
          const subSkills = await this.scanDirectory(fullPath, maxDepth, currentDepth + 1)
          skills.push(...subSkills)
        } else if (entry === SKILL_FILE_NAME) {
          // SKILL.md in current directory - skip if already discovered
          if (!this.discoveredPaths.has(fullPath)) {
            const skill = await this.parseSkillFile(fullPath)
            if (skill) {
              this.skills.set(skill.id, skill)
              this.discoveredPaths.add(fullPath)
              skills.push(skill)
            }
          }
        }
      }
    } catch {
      // Ignore errors when scanning directories
    }

    return skills
  }

  /**
   * Parse a SKILL.md file
   *
   * @param filePath - Path to SKILL.md file
   * @returns Skill definition or undefined
   */
  private async parseSkillFile(filePath: string): Promise<SkillDefinition | undefined> {
    try {
      const content = await readFile(filePath, "utf-8")
      const { data: frontmatter, content: body } = parseFrontmatter(content)

      // Get skill ID from directory name or frontmatter
      const dirName = basename(dirname(filePath))
      const id = (frontmatter.id as string) || dirName

      // Extract metadata
      const metadata: SkillMetadata = {
        version: frontmatter.version as string,
        author: frontmatter.author as string,
        tags: frontmatter.tags as string[],
        dependencies: frontmatter.dependencies as string[],
        triggers: frontmatter.triggers as string[],
        tools: frontmatter.tools as string[],
      }

      // Build skill definition
      const skill: SkillDefinition = {
        id,
        name: (frontmatter.name as string) || id,
        description: (frontmatter.description as string) || "",
        content: body,
        triggers: frontmatter.triggers as string[],
        tools: frontmatter.tools as string[],
        metadata,
        filePath,
      }

      return skill
    } catch {
      return undefined
    }
  }

  /**
   * Check if a message matches a trigger pattern
   *
   * @param message - Message to check
   * @param trigger - Trigger pattern
   * @returns True if matches
   */
  private matchesTrigger(message: string, trigger: string): boolean {
    const lowerTrigger = trigger.toLowerCase()

    // Simple contains match
    if (message.includes(lowerTrigger)) {
      return true
    }

    // Regex match (if trigger starts with /)
    if (trigger.startsWith("/") && trigger.endsWith("/")) {
      try {
        const regex = new RegExp(trigger.slice(1, -1), "i")
        return regex.test(message)
      } catch {
        return false
      }
    }

    // Word boundary match (for single words)
    if (!lowerTrigger.includes(" ")) {
      const wordBoundary = new RegExp(`\\b${lowerTrigger}\\b`, "i")
      return wordBoundary.test(message)
    }

    return false
  }
}

/**
 * Create a new skill loader
 *
 * @param projectRoot - Project root directory
 * @returns SkillLoader instance
 */
export function createSkillLoader(projectRoot?: string): SkillLoader {
  return new SkillLoader(projectRoot)
}

/**
 * Default skill loader instance
 */
export const defaultSkillLoader = new SkillLoader()
