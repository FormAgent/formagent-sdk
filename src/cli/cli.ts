/**
 * FormAgent CLI Implementation
 * @module formagent-sdk/cli/cli
 */

import * as readline from "node:readline"
import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"

import { createSession } from "../api"
import { builtinTools } from "../tools"
import { getTodos, clearTodos, setTodoChangeCallback } from "../tools/builtin/todo"
import { SkillLoader } from "../skills/loader"
import { createSkillTool } from "../tools/skill"
import { CLI_AGENT_PRESET, generateEnvContext } from "../prompt"
import { loadEnvOverride } from "../utils/env"
import type { Session } from "../types/session"

// Load .env and override shell environment variables
loadEnvOverride()

// Version from package.json (will be replaced at build time)
const VERSION = "0.1.0"

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
  gray: "\x1b[90m",
}

// Color helpers
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

  const envContext = generateEnvContext({
    cwd,
    isGitRepo: isGitRepo(cwd),
    platform: process.platform,
    osVersion: getOsVersion(),
    date: new Date(),
    shell: process.env.SHELL,
  })

  return `${CLI_AGENT_PRESET}\n\n${envContext}\n`
}

/**
 * Get all tools including skill tool
 */
function getAllTools() {
  const skillTool = createSkillTool({
    settingSources: [SKILLS_PATH],
    cwd: process.cwd(),
  })
  return [...builtinTools, skillTool]
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
${c.bold("FormAgent CLI")} - Interactive AI Agent

${c.bold("Usage:")}
  ${c.cyan("npx formagent")}              Start interactive mode
  ${c.cyan("npx formagent <question>")}   Quick query mode
  ${c.cyan("npx formagent --help")}       Show this help
  ${c.cyan("npx formagent --version")}    Show version

${c.bold("Interactive Commands:")}
  ${c.cyan("/help")}     Show available commands
  ${c.cyan("/clear")}    Clear conversation history
  ${c.cyan("/tools")}    List available tools
  ${c.cyan("/skills")}   List available skills
  ${c.cyan("/todos")}    Show current todo list
  ${c.cyan("/usage")}    Show token usage statistics
  ${c.cyan("/debug")}    Show debug info (prompt, model, env)
  ${c.cyan("/exit")}     Exit the CLI

${c.bold("Environment:")}
  ${c.cyan("ANTHROPIC_API_KEY")}   Anthropic API key (for Claude models)
  ${c.cyan("ANTHROPIC_MODEL")}     Optional. Claude model (default: claude-sonnet-4-20250514)
  ${c.cyan("OPENAI_API_KEY")}      OpenAI API key (for GPT models)
  ${c.cyan("OPENAI_MODEL")}        Optional. OpenAI model (default: gpt-4o)
  ${c.cyan("OPENAI_BASE_URL")}     Optional. Custom OpenAI-compatible API URL

${c.bold("Examples:")}
  ${c.dim("# Start interactive mode")}
  npx formagent

  ${c.dim("# Quick query")}
  npx formagent "What is the capital of France?"

  ${c.dim("# Multi-word query")}
  npx formagent "Explain how async/await works in JavaScript"
`)
}

/**
 * Print version
 */
function printVersion() {
  console.log(`formagent-sdk v${VERSION}`)
}

/**
 * Print welcome banner
 */
function printBanner() {
  const model = getDefaultModel()
  console.log()
  console.log(c.cyan("╔═══════════════════════════════════════════════════════════╗"))
  console.log(c.cyan("║") + c.bold("              FormAgent CLI v" + VERSION + "                     ") + c.cyan("║"))
  console.log(c.cyan("║") + c.dim("           AI Agent Framework                              ") + c.cyan("║"))
  console.log(c.cyan("╚═══════════════════════════════════════════════════════════╝"))
  console.log()
  console.log(c.dim("  Model: ") + c.green(model))
  console.log(c.dim("  Type your message and press Enter to chat."))
  console.log(c.dim("  Use /help for commands, /exit to quit."))
  console.log()
}

/**
 * Print interactive help
 */
function printInteractiveHelp() {
  console.log()
  console.log(c.bold("Available Commands:"))
  console.log()
  console.log(`  ${c.cyan("/help")}     Show this help message`)
  console.log(`  ${c.cyan("/clear")}    Clear conversation history`)
  console.log(`  ${c.cyan("/tools")}    List available tools`)
  console.log(`  ${c.cyan("/skills")}   List available skills`)
  console.log(`  ${c.cyan("/todos")}    Show current todo list`)
  console.log(`  ${c.cyan("/usage")}    Show token usage statistics`)
  console.log(`  ${c.cyan("/debug")}    Show debug info (prompt, model, env)`)
  console.log(`  ${c.cyan("/exit")}     Exit the CLI`)
  console.log()
}

/**
 * Print tools list
 */
function printTools() {
  const tools = getAllTools()
  console.log()
  console.log(c.bold("Available Tools:"))
  console.log()
  for (const tool of tools) {
    console.log(`  ${c.green("●")} ${c.bold(tool.name)}`)
    const desc = tool.description?.split("\n")[0] || ""
    console.log(`    ${c.dim(desc.slice(0, 70))}${desc.length > 70 ? "..." : ""}`)
  }
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
  const tools = getAllTools()
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
  console.log(c.bold("Tools:") + c.dim(` (${tools.length} total)`))
  const toolNames = tools.map(t => t.name)
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
      return String(input.command || "")
    case "Read":
      return String(input.file_path || "")
    case "Write":
      return `${input.file_path} (${(String(input.content || "")).length} chars)`
    case "Edit":
      return String(input.file_path || "")
    case "Glob":
      return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`
    case "Grep":
      return `/${input.pattern}/${input.path ? ` in ${input.path}` : ""}`
    case "WebFetch":
      return String(input.url || "")
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
 * Get the default model based on environment
 */
function getDefaultModel(): string {
  // Select based on API key and provider-specific model env var
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_MODEL || "gpt-4o"
  }
  return "claude-sonnet-4-20250514" // fallback
}

/**
 * Create or get session
 */
async function getSession(): Promise<Session> {
  if (!session) {
    session = await createSession({
      model: getDefaultModel(),
      tools: getAllTools(),
      systemPrompt: buildSystemPrompt(),
    })
  }
  return session as Session
}

/**
 * Process streaming events
 */
async function processStream(sess: Session): Promise<void> {
  let hasText = false

  for await (const event of sess.receive()) {
    switch (event.type) {
      case "text":
        if (!hasText) {
          process.stdout.write("\n")
          hasText = true
        }
        process.stdout.write(event.text)
        break

      case "tool_use":
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
 * Handle user input in interactive mode
 */
async function handleInput(input: string): Promise<boolean> {
  const trimmed = input.trim()

  if (!trimmed) {
    return true
  }

  // Slash commands
  if (trimmed.startsWith("/")) {
    const cmd = trimmed.toLowerCase()

    switch (cmd) {
      case "/help":
        printInteractiveHelp()
        return true

      case "/clear":
        if (session) {
          await session.close()
          session = null
        }
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

  // Regular message
  try {
    const sess = await getSession()
    await sess.send(trimmed)
    await processStream(sess)
  } catch (error) {
    console.log(c.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`))
  }

  return true
}

/**
 * Run quick query mode
 */
async function runQuickQuery(query: string): Promise<void> {
  // Check API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error(c.red("Error: No API key found"))
    console.error(c.dim("Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable"))
    process.exit(1)
  }

  try {
    const sess = await getSession()
    await sess.send(query)
    await processStream(sess)
    await sess.close()
  } catch (error) {
    console.error(c.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

/**
 * Run interactive mode
 */
async function runInteractive(): Promise<void> {
  // Check API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error(c.red("Error: No API key found"))
    console.error(c.dim("Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable"))
    process.exit(1)
  }

  // Set up todo callback
  setTodoChangeCallback(() => {
    // Could show updates here
  })

  printBanner()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

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

  rl.on("SIGINT", async () => {
    console.log(c.dim("\n\nInterrupted. Goodbye!\n"))
    if (session) {
      await session.close()
    }
    process.exit(0)
  })

  prompt()
}

/**
 * Main CLI entry point
 */
export async function runCLI(args: string[]): Promise<void> {
  // Parse arguments
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return
  }

  if (args.includes("--version") || args.includes("-v")) {
    printVersion()
    return
  }

  // Filter out flags
  const query = args.filter((arg) => !arg.startsWith("-")).join(" ").trim()

  if (query) {
    // Quick query mode
    await runQuickQuery(query)
  } else {
    // Interactive mode
    await runInteractive()
  }
}
