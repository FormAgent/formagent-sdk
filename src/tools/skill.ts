/**
 * Skill tool implementation
 *
 * The Skill tool allows Claude to discover and invoke skills.
 * When a skill is invoked, its content is injected into the conversation.
 *
 * @module formagent-sdk/tools/skill
 */

import type { ToolDefinition, ToolContext, ToolOutput } from "../types/tool"
import type { SkillDefinition } from "../types/skill"
import { SkillLoader } from "../skills/loader"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

/**
 * Skill tool configuration
 */
export interface SkillToolConfig {
  /** Skill source paths (absolute paths to skill directories) */
  settingSources?: string[]
  /** Working directory for relative paths */
  cwd?: string
}

/**
 * Default user skills path
 */
export const DEFAULT_USER_SKILLS_PATH = join(homedir(), ".claude/skills")

/**
 * Get project skills path relative to cwd
 */
export function getProjectSkillsPath(cwd: string): string {
  return join(cwd, ".claude/skills")
}

/**
 * Skill tool input schema
 */
export const skillToolSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["list", "invoke"],
      description: "Action to perform: 'list' to show available skills, 'invoke' to use a skill",
    },
    skill_name: {
      type: "string",
      description: "Name or ID of the skill to invoke (required when action is 'invoke')",
    },
    query: {
      type: "string",
      description: "Optional search query to filter skills (used with 'list' action)",
    },
  },
  required: ["action"],
}

/**
 * Create the Skill tool
 *
 * The Skill tool enables Claude to:
 * 1. List available skills with their descriptions
 * 2. Invoke a skill by name, which returns the skill's content to be used in the conversation
 *
 * @param config - Tool configuration
 * @returns Skill tool definition
 *
 * @example
 * ```ts
 * const skillTool = createSkillTool({
 *   settingSources: [
 *     "~/.claude/skills",        // User skills
 *     "/project/.claude/skills", // Project skills
 *   ],
 * })
 *
 * const session = await createSession({
 *   tools: [skillTool, ...otherTools],
 *   allowedTools: ["Skill", "Read", "Write"],
 * })
 * ```
 */
export function createSkillTool(config: SkillToolConfig = {}): ToolDefinition {
  const loader = new SkillLoader(config.cwd)
  let initialized = false

  // Resolve setting sources to actual paths
  const resolvePaths = (): string[] => {
    const paths: string[] = []

    if (config.settingSources && config.settingSources.length > 0) {
      for (const source of config.settingSources) {
        // Expand ~ to home directory
        const resolvedPath = source.startsWith("~")
          ? join(homedir(), source.slice(1))
          : source

        if (existsSync(resolvedPath)) {
          paths.push(resolvedPath)
        }
      }
    } else {
      // Default: user skills only
      if (existsSync(DEFAULT_USER_SKILLS_PATH)) {
        paths.push(DEFAULT_USER_SKILLS_PATH)
      }
    }

    return paths
  }

  // Initialize skill loader
  const initialize = async () => {
    if (initialized) return

    const paths = resolvePaths()
    await loader.discover({
      directories: paths,
      includeUserSkills: false, // We handle paths manually
      includeProjectSkills: false,
      maxDepth: 3,
    })

    initialized = true
  }

  return {
    name: "Skill",
    description: `Discover and use specialized skills that extend Claude's capabilities.

Actions:
- "list": Show available skills with their descriptions and triggers
- "invoke": Activate a skill by name to get specialized instructions

When you invoke a skill, you will receive detailed instructions and guidelines that you should follow for the current task.

Skills are discovered from configured directories and provide domain-specific expertise.`,
    inputSchema: skillToolSchema,
    execute: async (
      rawInput: Record<string, unknown>,
      _context: ToolContext
    ): Promise<ToolOutput> => {
      await initialize()

      const input = rawInput as { action: string; skill_name?: string; query?: string }
      const { action, skill_name, query } = input

      if (action === "list") {
        return listSkills(loader, query)
      }

      if (action === "invoke") {
        if (!skill_name) {
          return {
            content: "Error: skill_name is required when action is 'invoke'",
            isError: true,
          }
        }
        return invokeSkill(loader, skill_name)
      }

      return {
        content: `Error: Unknown action "${action}". Use "list" or "invoke".`,
        isError: true,
      }
    },
  }
}

/**
 * List available skills
 */
async function listSkills(loader: SkillLoader, query?: string): Promise<ToolOutput> {
  const skills = query ? await loader.search(query) : loader.getAll()

  if (skills.length === 0) {
    return {
      content: query
        ? `No skills found matching "${query}".`
        : "No skills available. Skills are loaded from configured settingSources directories.",
    }
  }

  const skillList = skills.map((skill) => {
    const triggers = skill.triggers?.slice(0, 3).join(", ") || "none"
    return `- **${skill.name}** (${skill.id})
  Description: ${skill.description || "No description"}
  Triggers: ${triggers}`
  })

  return {
    content: `# Available Skills

${skillList.join("\n\n")}

To use a skill, invoke the Skill tool with action="invoke" and skill_name="<skill-id>".`,
  }
}

/**
 * Invoke a skill and return its content
 */
async function invokeSkill(loader: SkillLoader, skillName: string): Promise<ToolOutput> {
  // Try to find by ID first
  let skill = await loader.load(skillName)

  // If not found, search by name
  if (!skill) {
    const matches = await loader.search(skillName)
    if (matches.length === 1) {
      skill = matches[0]
    } else if (matches.length > 1) {
      const names = matches.map((s) => `${s.name} (${s.id})`).join(", ")
      return {
        content: `Multiple skills match "${skillName}": ${names}. Please specify the exact skill ID.`,
        isError: true,
      }
    }
  }

  if (!skill) {
    return {
      content: `Skill "${skillName}" not found. Use action="list" to see available skills.`,
      isError: true,
    }
  }

  // Return skill content - this will be injected into the conversation
  return {
    content: formatSkillContent(skill),
    metadata: {
      skillId: skill.id,
      skillName: skill.name,
      activated: true,
    },
  }
}

/**
 * Format skill content for injection into conversation
 */
function formatSkillContent(skill: SkillDefinition): string {
  const parts: string[] = []

  parts.push(`# Skill Activated: ${skill.name}`)
  parts.push("")

  if (skill.description) {
    parts.push(`**Description:** ${skill.description}`)
    parts.push("")
  }

  if (skill.tools && skill.tools.length > 0) {
    parts.push(`**Recommended Tools:** ${skill.tools.join(", ")}`)
    parts.push("")
  }

  parts.push("## Instructions")
  parts.push("")
  parts.push(skill.content)

  return parts.join("\n")
}

/**
 * Default skill tool instance (uses default user skills path)
 */
export const skillTool = createSkillTool()
