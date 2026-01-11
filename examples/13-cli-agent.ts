#!/usr/bin/env bun
/**
 * CLI Agent Example - Similar to Claude Code
 *
 * A fully interactive command-line agent with:
 * - Multi-turn conversations
 * - Built-in tools (Bash, Read, Write, Edit, Glob, Grep, etc.)
 * - Skills support (loaded from ~/.claude)
 * - Streaming responses
 * - Tool call visualization
 * - Token usage tracking
 * - Slash commands (/help, /clear, /exit, /tools, /skills, /history)
 */

import * as readline from "node:readline"
import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import {
  createSession,
  builtinTools,
  getTodos,
  clearTodos,
  setTodoChangeCallback,
  SkillLoader,
  CLI_AGENT_PRESET,
  generateEnvContext,
  loadEnvOverride,
} from "../src"
import type { Session, SessionEvent } from "../src"

// Load .env and override shell environment variables
loadEnvOverride()

// Skills path
const SKILLS_PATH = join(homedir(), ".claude")

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
}

// Helper functions for colored output
const c = {
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  red: (s: string) => `${colors.red}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  blue: (s: string) => `${colors.blue}${s}${colors.reset}`,
  magenta: (s: string) => `${colors.magenta}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,
}

// State
let session: Session | null = null
let totalInputTokens = 0
let totalOutputTokens = 0
let messageCount = 0

/**
 * Check if a directory is a git repository
 */
function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"))
}

/**
 * Get OS version
 */
function getOsVersion(): string {
  try {
    return require("node:os").release()
  } catch {
    return ""
  }
}

/**
 * Build the full system prompt with environment context
 */
function buildSystemPrompt(): string {
  const cwd = process.cwd()

  // Generate environment context
  const envContext = generateEnvContext({
    cwd,
    isGitRepo: isGitRepo(cwd),
    platform: process.platform,
    osVersion: getOsVersion(),
    date: new Date(),
    shell: process.env.SHELL,
  })

  // Combine CLI preset with environment context
  return `${CLI_AGENT_PRESET}

${envContext}
`
}

/**
 * Get the default model based on environment
 */
function getDefaultModel(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_MODEL || "gpt-4o"
  }
  return "claude-sonnet-4-20250514"
}

/**
 * Print welcome banner
 */
function printBanner() {
  const model = getDefaultModel()
  console.log()
  console.log(c.cyan("╔═══════════════════════════════════════════════════════════╗"))
  console.log(c.cyan("║") + c.bold("          formagent-sdk CLI Agent                  ") + c.cyan("║"))
  console.log(c.cyan("║") + c.dim("          Similar to Claude Code - Demo                    ") + c.cyan("║"))
  console.log(c.cyan("╚═══════════════════════════════════════════════════════════╝"))
  console.log()
  console.log(c.dim("  Model: ") + c.green(model))
  console.log(c.dim("  Skills loaded from: ~/.claude"))
  console.log(c.dim("  Use /help for commands, /skills to list skills."))
  console.log()
}

/**
 * Print help message
 */
function printHelp() {
  console.log()
  console.log(c.bold("Available Commands:"))
  console.log()
  console.log(`  ${c.cyan("/help")}     - Show this help message`)
  console.log(`  ${c.cyan("/clear")}    - Clear conversation history`)
  console.log(`  ${c.cyan("/tools")}    - List available tools`)
  console.log(`  ${c.cyan("/skills")}   - List available skills`)
  console.log(`  ${c.cyan("/todos")}    - Show current todo list`)
  console.log(`  ${c.cyan("/usage")}    - Show token usage statistics`)
  console.log(`  ${c.cyan("/debug")}    - Show debug info (prompt, model, env)`)
  console.log(`  ${c.cyan("/exit")}     - Exit the CLI`)
  console.log()
  console.log(c.dim("  Or just type your message to chat with the assistant."))
  console.log()
}

/**
 * Print tools list
 */
function printTools() {
  console.log()
  console.log(c.bold("Available Tools:"))
  console.log()
  for (const tool of builtinTools) {
    console.log(`  ${c.green("●")} ${c.bold(tool.name)}`)
    console.log(`    ${c.dim(tool.description?.slice(0, 70) + "...")}`)
  }
  // Add Skill tool info
  console.log(`  ${c.green("●")} ${c.bold("Skill")}`)
  console.log(`    ${c.dim("Discover and use specialized skills from ~/.claude")}`)
  console.log()
}

/**
 * Print skills list
 */
async function printSkills() {
  console.log()
  console.log(c.bold("Available Skills:"))
  console.log(c.dim(`  (from ${SKILLS_PATH})`))
  console.log()

  const loader = new SkillLoader()
  const skills = await loader.discover({
    directories: [SKILLS_PATH],
    includeUserSkills: false,
    includeProjectSkills: false,
    maxDepth: 3,
  })

  if (skills.length === 0) {
    console.log(c.dim("  No skills found."))
  } else {
    for (const skill of skills) {
      const triggers = skill.triggers?.slice(0, 3).join(", ") || "none"
      console.log(`  ${c.magenta("◆")} ${c.bold(skill.name)} ${c.dim(`[${skill.id}]`)}`)
      if (skill.description) {
        console.log(`    ${c.dim(skill.description.slice(0, 60))}...`)
      }
      console.log(`    ${c.dim("Triggers:")} ${triggers}`)
    }
  }
  console.log()
}

/**
 * Print todos
 */
function printTodos() {
  const todos = getTodos()
  console.log()
  if (todos.length === 0) {
    console.log(c.dim("  No todos."))
  } else {
    console.log(c.bold("Current Todos:"))
    console.log()
    for (const todo of todos) {
      const icon =
        todo.status === "completed" ? c.green("✓") :
        todo.status === "in_progress" ? c.yellow("→") : c.dim("○")
      console.log(`  ${icon} ${todo.content}`)
    }
  }
  console.log()
}

/**
 * Print usage statistics
 */
function printUsage() {
  console.log()
  console.log(c.bold("Token Usage:"))
  console.log()
  console.log(`  ${c.cyan("Messages:")}      ${messageCount}`)
  console.log(`  ${c.cyan("Input tokens:")}  ${totalInputTokens.toLocaleString()}`)
  console.log(`  ${c.cyan("Output tokens:")} ${totalOutputTokens.toLocaleString()}`)
  console.log(`  ${c.cyan("Total tokens:")}  ${(totalInputTokens + totalOutputTokens).toLocaleString()}`)

  // Rough cost estimate (Claude Sonnet pricing)
  const inputCost = (totalInputTokens / 1_000_000) * 3
  const outputCost = (totalOutputTokens / 1_000_000) * 15
  console.log(`  ${c.cyan("Est. cost:")}     $${(inputCost + outputCost).toFixed(4)}`)
  console.log()
}

/**
 * Print debug information
 */
function printDebug() {
  const model = getDefaultModel()
  const systemPrompt = buildSystemPrompt()
  const cwd = process.cwd()

  console.log()
  console.log(c.bold("═══════════════════════════════════════════════════════════"))
  console.log(c.bold("                    DEBUG INFORMATION                       "))
  console.log(c.bold("═══════════════════════════════════════════════════════════"))
  console.log()

  // Model info
  console.log(c.bold("Model:"))
  console.log(`  ${c.cyan("Current:")}        ${model}`)
  console.log(`  ${c.cyan("ANTHROPIC_MODEL:")} ${process.env.ANTHROPIC_MODEL || c.dim("(not set)")}`)
  console.log(`  ${c.cyan("OPENAI_MODEL:")}    ${process.env.OPENAI_MODEL || c.dim("(not set)")}`)
  console.log(`  ${c.cyan("OPENAI_BASE_URL:")} ${process.env.OPENAI_BASE_URL || c.dim("(not set)")}`)
  console.log()

  // API Keys (masked)
  console.log(c.bold("API Keys:"))
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  console.log(`  ${c.cyan("ANTHROPIC_API_KEY:")} ${anthropicKey ? c.green("✓ set") + c.dim(` (${anthropicKey.slice(0, 8)}...${anthropicKey.slice(-4)})`) : c.red("✗ not set")}`)
  console.log(`  ${c.cyan("OPENAI_API_KEY:")}    ${openaiKey ? c.green("✓ set") + c.dim(` (${openaiKey.slice(0, 8)}...${openaiKey.slice(-4)})`) : c.red("✗ not set")}`)
  console.log()

  // Environment
  console.log(c.bold("Environment:"))
  console.log(`  ${c.cyan("Working dir:")}  ${cwd}`)
  console.log(`  ${c.cyan("Git repo:")}     ${isGitRepo(cwd) ? c.green("Yes") : "No"}`)
  console.log(`  ${c.cyan("Platform:")}     ${process.platform}`)
  console.log(`  ${c.cyan("OS Version:")}   ${getOsVersion()}`)
  console.log(`  ${c.cyan("Shell:")}        ${process.env.SHELL || c.dim("(not set)")}`)
  console.log(`  ${c.cyan("Skills path:")}  ${SKILLS_PATH}`)
  console.log()

  // Tools
  const toolNames = builtinTools.map(t => t.name)
  toolNames.push("Skill") // Add Skill tool
  console.log(c.bold("Tools:") + c.dim(` (${toolNames.length} total)`))
  console.log(`  ${toolNames.join(", ")}`)
  console.log()

  // Session state
  console.log(c.bold("Session State:"))
  console.log(`  ${c.cyan("Active:")}         ${session ? c.green("Yes") : "No"}`)
  console.log(`  ${c.cyan("Messages:")}       ${messageCount}`)
  console.log(`  ${c.cyan("Input tokens:")}   ${totalInputTokens.toLocaleString()}`)
  console.log(`  ${c.cyan("Output tokens:")}  ${totalOutputTokens.toLocaleString()}`)
  console.log()

  // System prompt
  console.log(c.bold("System Prompt:") + c.dim(` (${systemPrompt.length} chars)`))
  console.log(c.dim("─".repeat(60)))
  // Show truncated prompt with line numbers
  const promptLines = systemPrompt.split("\n")
  const maxLines = 50
  for (let i = 0; i < Math.min(promptLines.length, maxLines); i++) {
    const lineNum = String(i + 1).padStart(3, " ")
    const line = promptLines[i].slice(0, 75)
    console.log(`${c.dim(lineNum + "│")} ${line}${promptLines[i].length > 75 ? c.dim("...") : ""}`)
  }
  if (promptLines.length > maxLines) {
    console.log(c.dim(`    ... (${promptLines.length - maxLines} more lines)`))
  }
  console.log(c.dim("─".repeat(60)))
  console.log()
}

/**
 * Format tool input for display
 */
function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Bash":
      return input.command as string
    case "Read":
      return input.file_path as string
    case "Write":
      return `${input.file_path} (${((input.content as string)?.length || 0)} chars)`
    case "Edit":
      return `${input.file_path}`
    case "Glob":
      return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`
    case "Grep":
      return `/${input.pattern}/${input.path ? ` in ${input.path}` : ""}`
    case "WebFetch":
      return input.url as string
    case "TodoWrite":
      return `${(input.todos as unknown[])?.length || 0} items`
    case "Skill":
      if (input.action === "list") {
        return input.query ? `list (query: ${input.query})` : "list"
      }
      return `invoke ${input.skill_name || ""}`
    default:
      return JSON.stringify(input).slice(0, 50)
  }
}

/**
 * Process streaming events
 */
async function processStream(session: Session): Promise<void> {
  let currentToolName = ""
  let hasText = false

  for await (const event of session.receive()) {
    switch (event.type) {
      case "text":
        if (!hasText) {
          process.stdout.write("\n")
          hasText = true
        }
        process.stdout.write(event.text)
        break

      case "tool_use":
        currentToolName = event.name
        const inputDisplay = formatToolInput(event.name, event.input as Record<string, unknown>)
        console.log(`\n${c.yellow("⚡")} ${c.bold(event.name)} ${c.dim(inputDisplay)}`)
        break

      case "tool_result":
        const content = typeof event.content === "string" ? event.content : JSON.stringify(event.content)
        if (event.is_error) {
          console.log(`${c.red("✗")} ${c.red("Error:")} ${content?.slice(0, 100)}`)
        } else {
          const preview = content?.split("\n")[0]?.slice(0, 80) || ""
          console.log(`${c.green("✓")} ${c.dim(preview)}${content && content.length > 80 ? "..." : ""}`)
        }
        break

      case "error":
        console.log(`\n${c.red("Error:")} ${event.error}`)
        break

      case "stop":
        // Update usage from stop event
        if (event.usage) {
          totalInputTokens += event.usage.input_tokens || 0
          totalOutputTokens += event.usage.output_tokens || 0
        }
        if (hasText) {
          console.log("\n")
        }
        break
    }
  }

  messageCount++
}

/**
 * Handle user input
 */
async function handleInput(input: string): Promise<boolean> {
  const trimmed = input.trim()

  // Empty input
  if (!trimmed) {
    return true
  }

  // Slash commands
  if (trimmed.startsWith("/")) {
    const cmd = trimmed.toLowerCase()

    switch (cmd) {
      case "/help":
        printHelp()
        return true

      case "/clear":
        if (session) {
          await session.close()
        }
        session = await createSession({
          model: getDefaultModel(),
          tools: builtinTools,
          systemPrompt: buildSystemPrompt(),
          settingSources: [SKILLS_PATH],
        })
        clearTodos()
        totalInputTokens = 0
        totalOutputTokens = 0
        messageCount = 0
        console.log(c.green("\n  ✓ Conversation cleared.\n"))
        return true

      case "/tools":
        printTools()
        return true

      case "/skills":
        await printSkills()
        return true

      case "/todos":
        printTodos()
        return true

      case "/usage":
        printUsage()
        return true

      case "/debug":
        printDebug()
        return true

      case "/exit":
      case "/quit":
      case "/q":
        return false

      default:
        console.log(c.yellow(`\n  Unknown command: ${cmd}. Type /help for available commands.\n`))
        return true
    }
  }

  // Regular message - send to Claude
  if (!session) {
    session = await createSession({
      model: getDefaultModel(),
      tools: builtinTools,
      systemPrompt: buildSystemPrompt(),
      settingSources: [SKILLS_PATH],
    })
  }

  try {
    await session.send(trimmed)
    await processStream(session)
  } catch (error) {
    console.log(c.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`))
  }

  return true
}

/**
 * Create readline interface
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })
}

/**
 * Main entry point
 */
async function main() {
  // API key is automatically read from ANTHROPIC_API_KEY env var
  // No need to manually set up provider!

  // Set up todo change callback
  setTodoChangeCallback((todos) => {
    // Could show todo updates here if desired
  })

  // Print banner
  printBanner()

  // Create readline interface
  const rl = createInterface()

  // Prompt function
  const prompt = () => {
    rl.question(c.cyan("❯ "), async (input) => {
      const shouldContinue = await handleInput(input)
      if (shouldContinue) {
        prompt()
      } else {
        console.log(c.dim("\nGoodbye!\n"))
        if (session) {
          await session.close()
        }
        rl.close()
        process.exit(0)
      }
    })
  }

  // Handle Ctrl+C
  rl.on("SIGINT", async () => {
    console.log(c.dim("\n\nInterrupted. Goodbye!\n"))
    if (session) {
      await session.close()
    }
    process.exit(0)
  })

  // Start prompting
  prompt()
}

// Run
main().catch((error) => {
  console.error(c.red(`\nFatal error: ${error.message}\n`))
  process.exit(1)
})
