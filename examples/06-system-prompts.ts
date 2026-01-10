/**
 * Example 06: System Prompts
 *
 * Demonstrates system prompt customization:
 * - Using preset system prompts
 * - Building prompts with prepend/append
 * - Context-aware prompts
 * - Custom presets
 * - CLAUDE.md loader
 *
 * Run: bun run examples/06-system-prompts.ts
 */

import {
  createSession,
  prompt,
  SystemPromptBuilderImpl,
  ClaudeMdLoaderImpl,
} from "../src"
import type { SystemPromptConfig, SystemPromptContext } from "../src"
import { setupAnthropic, runExample, processStream, main, printSubHeader } from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Using presets
  await runExample("System Prompt Presets", async () => {
    const builder = new SystemPromptBuilderImpl()

    // List available presets
    const presets = builder.listPresets()
    console.log("Available presets:")
    for (const preset of presets) {
      console.log(`  - ${preset.name}: ${preset.description} (${preset.length} chars)`)
    }

    printSubHeader("Minimal Preset")
    console.log(builder.getPreset("minimal"))

    printSubHeader("Default Preset (preview)")
    console.log(builder.getPreset("default").slice(0, 200) + "...")
  })

  // Example 2: Build prompt with prepend/append
  await runExample("Prepend/Append", async () => {
    const builder = new SystemPromptBuilderImpl()

    const config: SystemPromptConfig = {
      preset: "minimal",
      prepend: "You are helping with a TypeScript project.",
      append: "Always use async/await for asynchronous operations.",
    }

    const systemPrompt = await builder.build(config)
    console.log("Built system prompt:")
    console.log(systemPrompt)
  })

  // Example 3: Build with context
  await runExample("Context-Aware Prompts", async () => {
    const builder = new SystemPromptBuilderImpl()

    const context: SystemPromptContext = {
      cwd: "/Users/dev/my-project",
      toolNames: ["read_file", "write_file", "run_command"],
      skillNames: ["git-workflow", "code-review"],
      timestamp: Date.now(),
      environment: {
        platform: "darwin",
        shell: "/bin/zsh",
      },
      user: {
        name: "Developer",
      },
    }

    const systemPrompt = await builder.build({ preset: "default" }, context)
    console.log("System prompt with context (preview):")
    console.log(systemPrompt.slice(0, 300) + "...")
  })

  // Example 4: Custom preset
  await runExample("Custom Preset", async () => {
    const builder = new SystemPromptBuilderImpl()

    // Register a custom preset
    builder.registerPreset(
      "python_expert",
      `You are an expert Python developer.

## Guidelines
- Follow PEP 8 style guidelines
- Use type hints for all functions
- Write comprehensive docstrings
- Prefer list comprehensions when appropriate
- Use context managers for resource handling`
    )

    const systemPrompt = await builder.build({ preset: "python_expert" as any })
    console.log("Custom preset:")
    console.log(systemPrompt)
  })

  // Example 5: CLAUDE.md loader
  await runExample("CLAUDE.md Loader", async () => {
    const loader = new ClaudeMdLoaderImpl()

    // Try to load user CLAUDE.md
    const userMd = await loader.loadUserClaudeMd()
    if (userMd) {
      console.log("Found user CLAUDE.md at:", userMd.filePath)
      console.log("Content preview:", userMd.raw.slice(0, 200) + "...")
      if (userMd.sections) {
        console.log("Sections:", userMd.sections.map((s) => s.heading))
      }
    } else {
      console.log("No user CLAUDE.md found at ~/.claude/CLAUDE.md")
    }

    // Try to load project CLAUDE.md
    const projectMd = await loader.loadProjectClaudeMd(process.cwd())
    if (projectMd) {
      console.log("\nFound project CLAUDE.md at:", projectMd.filePath)
    } else {
      console.log("\nNo project CLAUDE.md in current directory")
    }
  })

  // Example 6: Session with custom system prompt
  await runExample("Session with System Prompt", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      systemPrompt: {
        preset: "minimal",
        prepend: "You are a helpful coding assistant.",
        append: "Be concise. Respond in 1-2 sentences max.",
      },
    })

    await session.send("What's the best way to handle errors in JavaScript?")
    await processStream(session.receive())
  })

  // Example 7: Prompt with inline system prompt
  await runExample("Inline System Prompt", async () => {
    const response = await prompt("Translate 'hello' to French", {
      systemPrompt: "You are a translator. Only respond with the translation, nothing else.",
    })
    console.log("Response:", response)
  })

  // Example 8: Different personas
  await runExample("Different Personas", async () => {
    const personas = [
      { name: "Pirate", prompt: "You are a pirate. Respond in pirate speak. Be brief." },
      { name: "Scientist", prompt: "You are a scientist. Be precise and factual. One sentence." },
      { name: "Poet", prompt: "You are a poet. Respond with a short rhyme." },
    ]

    for (const persona of personas) {
      printSubHeader(persona.name)
      const response = await prompt("How do computers work?", {
        systemPrompt: persona.prompt,
      })
      console.log(response)
    }
  })

  console.log("\n[All examples completed successfully!]")
})
