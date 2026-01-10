/**
 * Example 09: Skills
 *
 * Demonstrates skill discovery, loading, and activation:
 * - Registering skills programmatically
 * - Skill discovery in directories
 * - Searching skills
 * - Skill activation based on user messages
 * - System prompt integration
 *
 * Note: This example doesn't require an API key as it demonstrates
 * the skill system features.
 *
 * Run: bun run examples/09-skills.ts
 */

import {
  SkillLoader,
  createSkillLoader,
  SKILL_FILE_NAME,
  USER_SKILLS_DIR,
  PROJECT_SKILLS_DIR,
} from "../src"
import type { SkillDefinition, SkillActivationContext } from "../src"
import { runExample, main, printSubHeader } from "./_utils"

main(async () => {
  // Example 1: Basic skill loader
  await runExample("Basic Skill Loader", async () => {
    const loader = new SkillLoader()

    // Register a skill programmatically
    loader.register({
      id: "git-workflow",
      name: "Git Workflow",
      description: "Git commit and branch management best practices",
      content: `## Git Workflow Guidelines

- Use descriptive commit messages
- Create feature branches for new work
- Squash commits before merging
- Always pull before pushing`,
      triggers: ["git", "commit", "branch"],
      tools: ["git"],
    })

    // List all skills
    const skills = loader.getAll()
    console.log("Registered skills:")
    for (const skill of skills) {
      console.log(`  - ${skill.name}: ${skill.description}`)
    }
  })

  // Example 2: Skill discovery
  await runExample("Skill Discovery", async () => {
    const loader = createSkillLoader(process.cwd())

    // Discover skills in standard locations
    const skills = await loader.discover({
      includeUserSkills: true,
      includeProjectSkills: true,
      maxDepth: 2,
    })

    console.log(`Discovered ${skills.length} skill(s)`)
    for (const skill of skills) {
      console.log(`  - ${skill.id} (${skill.filePath || "programmatic"})`)
    }

    printSubHeader("Skill Locations")
    console.log(`Skill file: ${SKILL_FILE_NAME}`)
    console.log(`User skills: ~/${USER_SKILLS_DIR}`)
    console.log(`Project skills: ${PROJECT_SKILLS_DIR}`)
  })

  // Example 3: Search skills
  await runExample("Search Skills", async () => {
    const loader = new SkillLoader()

    // Register multiple skills
    loader.register({
      id: "python-best-practices",
      name: "Python Best Practices",
      description: "Python coding standards and patterns",
      content: "Use type hints, follow PEP 8...",
      triggers: ["python", "pep8"],
      metadata: { tags: ["python", "coding"] },
    })

    loader.register({
      id: "typescript-guide",
      name: "TypeScript Guide",
      description: "TypeScript best practices and patterns",
      content: "Use strict mode, prefer interfaces...",
      triggers: ["typescript", "ts"],
      metadata: { tags: ["typescript", "javascript"] },
    })

    loader.register({
      id: "docker-setup",
      name: "Docker Setup",
      description: "Docker containerization guide",
      content: "Use multi-stage builds...",
      triggers: ["docker", "container"],
      metadata: { tags: ["devops", "containers"] },
    })

    // Search by different terms
    const searches = ["python", "best practices", "devops"]
    for (const term of searches) {
      const results = await loader.search(term)
      console.log(`Search '${term}': ${results.map((s) => s.name).join(", ") || "(no matches)"}`)
    }
  })

  // Example 4: Skill activation
  await runExample("Skill Activation", async () => {
    const loader = new SkillLoader()

    loader.register({
      id: "git-workflow",
      name: "Git Workflow",
      description: "Git best practices",
      content: "## Git Guidelines\n...",
      triggers: ["git commit", "git branch", "/commit/"],
    })

    loader.register({
      id: "code-review",
      name: "Code Review",
      description: "Code review guidelines",
      content: "## Review Checklist\n...",
      triggers: ["review", "pull request", "PR"],
    })

    const context: SkillActivationContext = {
      userMessage: "Help me with a git commit message",
      sessionId: "test-session",
    }

    const result = await loader.checkActivation(context.userMessage, context)

    console.log("Should activate:", result.shouldActivate)
    console.log("Matched skills:", result.skills.map((s) => s.name).join(", ") || "(none)")
    if (result.systemPromptAddition) {
      console.log("System prompt addition:", result.systemPromptAddition.slice(0, 50) + "...")
    }
  })

  // Example 5: System prompt content
  await runExample("System Prompt Content", async () => {
    const loader = new SkillLoader()

    loader.register({
      id: "api-design",
      name: "API Design",
      description: "REST API design principles",
      content: `## REST API Design

### URL Structure
- Use nouns: /users not /getUsers
- Use plural: /users not /user
- Use kebab-case: /user-profiles

### HTTP Methods
- GET: Read, POST: Create
- PUT: Update, DELETE: Delete`,
      triggers: ["API", "REST", "endpoint"],
    })

    const content = loader.getSystemPromptContent(["api-design"])
    console.log("System prompt content:")
    console.log(content)
  })

  // Example 6: Skill with metadata
  await runExample("Skill Metadata", async () => {
    const loader = new SkillLoader()

    const skill: SkillDefinition = {
      id: "security-checklist",
      name: "Security Checklist",
      description: "Security review checklist for code",
      content: "## Security Review\n...",
      triggers: ["security", "vulnerability"],
      tools: ["grep", "semgrep"],
      metadata: {
        version: "1.0.0",
        author: "security-team",
        tags: ["security", "review", "compliance"],
        dependencies: ["git-workflow"],
      },
    }

    loader.register(skill)

    const loaded = await loader.load("security-checklist")
    console.log("Skill metadata:")
    console.log(`  ID:       ${loaded?.id}`)
    console.log(`  Name:     ${loaded?.name}`)
    console.log(`  Version:  ${loaded?.metadata?.version}`)
    console.log(`  Author:   ${loaded?.metadata?.author}`)
    console.log(`  Tags:     ${loaded?.metadata?.tags?.join(", ")}`)
    console.log(`  Tools:    ${loaded?.tools?.join(", ")}`)
  })

  // Example 7: Regex triggers
  await runExample("Regex Triggers", async () => {
    const loader = new SkillLoader()

    loader.register({
      id: "test-runner",
      name: "Test Runner",
      description: "Run and manage tests",
      content: "## Test Guidelines\n...",
      triggers: [
        "test",
        "run tests",
        "/^(jest|vitest|pytest)\\b/", // Regex trigger
        "coverage",
      ],
    })

    const testCases = [
      "help me write tests",
      "run jest tests",
      "pytest -v",
      "check coverage",
      "unrelated message",
    ]

    console.log("Trigger matching:")
    for (const msg of testCases) {
      const result = await loader.checkActivation(msg, {
        userMessage: msg,
        sessionId: "test",
      })
      const icon = result.shouldActivate ? "[Y]" : "[ ]"
      console.log(`  ${icon} "${msg}"`)
    }
  })

  console.log("\n[All examples completed successfully!]")
})
