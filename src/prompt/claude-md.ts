/**
 * CLAUDE.md file loader implementation
 * @module formagent-sdk/prompt/claude-md
 */

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import type {
  ClaudeMdLoader,
  ClaudeMdContent,
  ClaudeMdSection,
  SettingSourcesConfig,
} from "../types/prompt"

/**
 * Default CLAUDE.md filename
 */
export const CLAUDE_MD_FILENAME = "CLAUDE.md"

/**
 * User-level CLAUDE.md directory
 */
export const USER_CLAUDE_DIR = ".claude"

/**
 * CLAUDE.md loader implementation
 *
 * Loads and parses CLAUDE.md files from various locations:
 * - Project-level: CLAUDE.md in project root
 * - User-level: ~/.claude/CLAUDE.md
 * - Enterprise-level: Configured enterprise paths
 *
 * @example
 * ```ts
 * const loader = new ClaudeMdLoaderImpl()
 *
 * // Load project CLAUDE.md
 * const projectMd = await loader.loadProjectClaudeMd("/path/to/project")
 *
 * // Load user CLAUDE.md
 * const userMd = await loader.loadUserClaudeMd()
 *
 * // Load all according to settings
 * const all = await loader.loadAll({ user: true, project: true })
 * ```
 */
export class ClaudeMdLoaderImpl implements ClaudeMdLoader {
  /**
   * Load project-level CLAUDE.md
   *
   * Searches for CLAUDE.md in the given directory and parent directories
   * until a git root or filesystem root is reached.
   *
   * @param cwd - Working directory to start search from
   * @returns CLAUDE.md content or undefined if not found
   */
  async loadProjectClaudeMd(cwd: string): Promise<ClaudeMdContent | undefined> {
    const filePath = await this.findProjectClaudeMd(cwd)
    if (!filePath) {
      return undefined
    }

    return this.loadFile(filePath, "project")
  }

  /**
   * Load user-level CLAUDE.md from ~/.claude/CLAUDE.md
   *
   * @returns CLAUDE.md content or undefined if not found
   */
  async loadUserClaudeMd(): Promise<ClaudeMdContent | undefined> {
    const filePath = join(homedir(), USER_CLAUDE_DIR, CLAUDE_MD_FILENAME)
    if (!existsSync(filePath)) {
      return undefined
    }

    return this.loadFile(filePath, "user")
  }

  /**
   * Load all CLAUDE.md files according to settings
   *
   * @param config - Setting sources configuration
   * @param cwd - Working directory
   * @returns Array of CLAUDE.md contents
   */
  async loadAll(config: SettingSourcesConfig, cwd?: string): Promise<ClaudeMdContent[]> {
    const contents: ClaudeMdContent[] = []

    // Load user-level if enabled (default: true)
    if (config.user !== false) {
      const userMd = await this.loadUserClaudeMd()
      if (userMd) {
        contents.push(userMd)
      }
    }

    // Load project-level if enabled (default: true)
    if (config.project !== false && cwd) {
      const projectMd = await this.loadProjectClaudeMd(cwd)
      if (projectMd) {
        contents.push(projectMd)
      }
    }

    // Load additional paths
    if (config.additionalPaths) {
      for (const path of config.additionalPaths) {
        if (existsSync(path)) {
          const content = await this.loadFile(path, "project")
          if (content) {
            contents.push(content)
          }
        }
      }
    }

    return contents
  }

  /**
   * Merge multiple CLAUDE.md contents into one string
   *
   * @param contents - CLAUDE.md contents to merge
   * @returns Merged content string
   */
  merge(contents: ClaudeMdContent[]): string {
    if (contents.length === 0) {
      return ""
    }

    const parts: string[] = []

    for (const content of contents) {
      if (content.raw.trim()) {
        // Add source comment
        parts.push(`<!-- Source: ${content.filePath} (${content.type}) -->`)
        parts.push(content.raw.trim())
      }
    }

    return parts.join("\n\n")
  }

  /**
   * Find CLAUDE.md in project directory hierarchy
   *
   * @param startDir - Directory to start search from
   * @returns Path to CLAUDE.md or undefined
   */
  private async findProjectClaudeMd(startDir: string): Promise<string | undefined> {
    let currentDir = startDir

    while (currentDir !== "/") {
      const claudeMdPath = join(currentDir, CLAUDE_MD_FILENAME)
      if (existsSync(claudeMdPath)) {
        return claudeMdPath
      }

      // Stop at git root
      const gitPath = join(currentDir, ".git")
      if (existsSync(gitPath)) {
        break
      }

      const parentDir = dirname(currentDir)
      if (parentDir === currentDir) {
        break
      }
      currentDir = parentDir
    }

    return undefined
  }

  /**
   * Load and parse a CLAUDE.md file
   *
   * @param filePath - Path to the file
   * @param type - File type (user, project, enterprise)
   * @returns CLAUDE.md content
   */
  private async loadFile(
    filePath: string,
    type: "user" | "project" | "enterprise"
  ): Promise<ClaudeMdContent | undefined> {
    try {
      const raw = await readFile(filePath, "utf-8")
      const sections = this.parseSections(raw)

      return {
        raw,
        sections,
        filePath,
        type,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Parse markdown sections from content
   *
   * @param content - Raw markdown content
   * @returns Array of sections
   */
  private parseSections(content: string): ClaudeMdSection[] {
    const sections: ClaudeMdSection[] = []
    const lines = content.split("\n")
    let currentSection: ClaudeMdSection | null = null
    let contentLines: string[] = []

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

      if (headingMatch) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentLines.join("\n").trim()
          sections.push(currentSection)
        }

        // Start new section
        currentSection = {
          heading: headingMatch[2],
          level: headingMatch[1].length,
          content: "",
        }
        contentLines = []
      } else if (currentSection) {
        contentLines.push(line)
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.content = contentLines.join("\n").trim()
      sections.push(currentSection)
    }

    return sections
  }
}

/**
 * Create a new CLAUDE.md loader
 *
 * @returns ClaudeMdLoader instance
 */
export function createClaudeMdLoader(): ClaudeMdLoader {
  return new ClaudeMdLoaderImpl()
}

/**
 * Default CLAUDE.md loader instance
 */
export const defaultClaudeMdLoader = new ClaudeMdLoaderImpl()
