/**
 * Example 11: Skills with Skill Tool
 *
 * Demonstrates the Skill tool that Claude can invoke to discover and use skills.
 * Skills are loaded from configured path sources (settingSources).
 *
 * Features:
 * - Path-based skill sources (settingSources)
 * - Skill tool for Claude to discover/invoke skills
 * - Direct skill loading and searching
 * - Skill activation based on triggers
 *
 * Directory Structure:
 *   ~/.claude/skills/
 *   ├── git-workflow/
 *   │   └── SKILL.md
 *   ├── code-review/
 *   │   └── SKILL.md
 *   └── typescript-expert/
 *       └── SKILL.md
 *
 * SKILL.md Format:
 *   ---
 *   name: Skill Name
 *   description: What this skill does
 *   triggers:
 *     - keyword1
 *     - keyword2
 *   tools:
 *     - ToolName
 *   tags:
 *     - tag1
 *   ---
 *   # Skill Content
 *   Instructions and guidelines...
 */

import {
  createSession,
  SkillLoader,
  SystemPromptBuilderImpl,
  setDefaultProvider,
  AnthropicProvider,
  createSkillTool,
  DEFAULT_USER_SKILLS_PATH,
  getProjectSkillsPath,
} from "../src"
import { join } from "node:path"
import { homedir } from "node:os"

async function main() {
  console.log("=== Skill Tool Example ===\n")

  // ============================================================
  // Example 1: Session with Skill tool (settingSources config)
  // ============================================================
  console.log("=== Example 1: Session with Skill Tool ===")
  console.log("When settingSources is configured, the Skill tool is automatically added.\n")

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log("Skipping API test (ANTHROPIC_API_KEY not set)")
    console.log("")
  } else {
    setDefaultProvider(new AnthropicProvider({ apiKey }))

    // Define skill source paths
    const skillPaths = [
      DEFAULT_USER_SKILLS_PATH, // ~/.claude/skills
      getProjectSkillsPath(process.cwd()), // ./.claude/skills
    ]

    console.log("Skill source paths:")
    for (const path of skillPaths) {
      console.log(`  - ${path}`)
    }
    console.log("")

    // Create session with settingSources - Skill tool is automatically added
    const session = await createSession({
      model: "claude-sonnet-4-20250514",
      settingSources: skillPaths,
      systemPrompt: `You have access to a Skill tool that lets you discover and invoke specialized skills.
When the user asks about topics that match available skills, use the Skill tool to:
1. List available skills with action="list"
2. Invoke a skill with action="invoke" and skill_name="<skill-id>"

The invoked skill content will guide your response.`,
    })

    // Claude can now invoke the Skill tool
    await session.send("What skills are available? List them for me.")

    process.stdout.write("\nAssistant: ")
    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Tool: ${event.name}]`)
      }
    }
    console.log("\n")

    await session.close()
  }

  // ============================================================
  // Example 2: Direct Skill Tool Usage
  // ============================================================
  console.log("=== Example 2: Direct Skill Tool Usage ===")

  // Create Skill tool with custom paths
  const skillTool = createSkillTool({
    settingSources: [
      join(homedir(), ".claude/skills"),
      join(process.cwd(), ".claude/skills"),
    ],
    cwd: process.cwd(),
  })

  console.log(`Skill tool name: ${skillTool.name}`)
  console.log(`Description: ${skillTool.description?.slice(0, 100)}...`)
  console.log("")

  // List skills directly
  console.log("Listing skills:")
  const listResult = await skillTool.execute(
    { action: "list" },
    { sessionId: "demo", abortSignal: new AbortController().signal }
  )
  console.log(listResult.content)
  console.log("")

  // ============================================================
  // Example 3: Skill Loader with Path Discovery
  // ============================================================
  console.log("=== Example 3: Skill Loader with Paths ===")

  const loader = new SkillLoader(process.cwd())

  // Discover skills from specific paths
  const skills = await loader.discover({
    directories: [
      join(homedir(), ".claude/skills"),
      join(process.cwd(), ".claude/skills"),
    ],
    includeUserSkills: false, // We specify paths manually
    includeProjectSkills: false,
    maxDepth: 3,
  })

  console.log(`Found ${skills.length} skills:`)
  for (const skill of skills.slice(0, 5)) {
    const triggers = skill.triggers?.slice(0, 3).join(", ") || "none"
    console.log(`  - ${skill.name} [${skill.id}]`)
    console.log(`    Description: ${skill.description?.slice(0, 60) || "N/A"}...`)
    console.log(`    Triggers: ${triggers}`)
  }
  if (skills.length > 5) {
    console.log(`  ... and ${skills.length - 5} more`)
  }
  console.log("")

  // ============================================================
  // Example 4: Search and Invoke Skills
  // ============================================================
  console.log("=== Example 4: Search and Invoke Skills ===")

  const searchTerms = ["git", "typescript", "review", "pdf"]
  for (const term of searchTerms) {
    const results = await loader.search(term)
    const names = results.map((s) => s.name).join(", ") || "no matches"
    console.log(`  "${term}" → ${names}`)
  }
  console.log("")

  // ============================================================
  // Example 5: Skill Activation Check
  // ============================================================
  console.log("=== Example 5: Skill Activation Check ===")

  const testMessages = [
    "Help me write a git commit message",
    "Review this TypeScript code",
    "Create a PDF document",
    "What's the weather?", // No skill match
  ]

  for (const message of testMessages) {
    const result = await loader.checkActivation(message, {
      userMessage: message,
      sessionId: "demo",
    })

    const icon = result.shouldActivate ? "✓" : "✗"
    const skillNames = result.skills.map((s) => s.name).join(", ") || "none"
    console.log(`  ${icon} "${message.slice(0, 40)}..."`)
    console.log(`     → Activated: ${skillNames}`)
  }
  console.log("")

  // ============================================================
  // Example 6: Complete Workflow
  // ============================================================
  console.log("=== Example 6: Complete Workflow ===")
  console.log(`
// 1. Define skill paths
const skillPaths = [
  DEFAULT_USER_SKILLS_PATH,           // ~/.claude/skills
  getProjectSkillsPath(process.cwd()), // ./.claude/skills
  "/custom/skills/path",              // Custom paths
]

// 2. Create session with settingSources
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  settingSources: skillPaths,  // Skill tool is auto-added
})

// 3. Claude can now use the Skill tool
// - action="list" → List available skills
// - action="invoke", skill_name="git-workflow" → Get skill content

// 4. When Claude invokes a skill, the content is returned
// Claude will use the skill's instructions in its response
`)

  console.log("=== Done ===")
}

main().catch(console.error)
