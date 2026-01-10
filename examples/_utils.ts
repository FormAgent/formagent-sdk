/**
 * Shared utilities for examples
 *
 * Provides common setup, validation, and helper functions.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { AnthropicProvider, OpenAIProvider, setDefaultProvider } from "../src"
import type { LLMProvider } from "../src"

/**
 * Load .env file if it exists (for examples that don't use --env-file flag)
 * Local .env file takes precedence over shell environment variables
 */
function loadEnvFile(): void {
  const envPath = join(process.cwd(), ".env")
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue

      const eqIndex = trimmed.indexOf("=")
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        // Always set - local .env takes precedence over shell env
        process.env[key] = value
      }
    }
  }
}

// Auto-load .env file on module import
loadEnvFile()

// Debug: show if env was loaded (only when DEBUG_ENV=1 or DEBUG_ENV=true)
const isDebug = process.env.DEBUG_ENV === "1" || process.env.DEBUG_ENV === "true"
if (isDebug) {
  const key = process.env.ANTHROPIC_API_KEY
  console.log(`[Debug] ANTHROPIC_API_KEY loaded: ${key ? `${key.slice(0, 15)}...` : "NOT SET"}`)
}

/**
 * Environment variable names for API keys
 */
export const ENV_KEYS = {
  ANTHROPIC: "ANTHROPIC_API_KEY",
  OPENAI: "OPENAI_API_KEY",
} as const

/**
 * Check if an API key is configured
 */
export function hasApiKey(provider: "anthropic" | "openai"): boolean {
  const envKey = provider === "anthropic" ? ENV_KEYS.ANTHROPIC : ENV_KEYS.OPENAI
  return !!process.env[envKey]
}

/**
 * Get API key or throw with helpful message
 */
export function requireApiKey(provider: "anthropic" | "openai"): string {
  const envKey = provider === "anthropic" ? ENV_KEYS.ANTHROPIC : ENV_KEYS.OPENAI
  let apiKey = process.env[envKey]

  if (!apiKey) {
    console.error(`\n[Error] ${envKey} environment variable is not set.`)
    console.error(`\nTo run this example, set your API key:`)
    console.error(`  export ${envKey}=your-api-key-here`)
    console.error(`\nOr create a .env file with:`)
    console.error(`  ${envKey}=your-api-key-here\n`)
    process.exit(1)
  }

  // Clean up common issues: trim whitespace and newlines
  const cleanedKey = apiKey.trim()

  // Check if key was modified (had whitespace)
  if (cleanedKey !== apiKey) {
    console.warn(`[Warning] API key had leading/trailing whitespace - cleaned automatically.`)
  }

  // Validate API key format (warning only)
  if (provider === "anthropic") {
    if (!cleanedKey.startsWith("sk-ant-")) {
      console.warn(`[Warning] Anthropic API key may have unusual format.`)
      console.warn(`  Expected: sk-ant-...`)
      console.warn(`  Got: ${cleanedKey.substring(0, 10)}...`)
    }
  }

  // Update the env var with cleaned value for downstream use
  process.env[envKey] = cleanedKey

  return cleanedKey
}

/**
 * Setup the default Anthropic provider
 * Validates API key before creating provider
 */
export function setupAnthropic(): AnthropicProvider {
  const apiKey = requireApiKey("anthropic")
  const provider = new AnthropicProvider({ apiKey })
  setDefaultProvider(provider)
  return provider
}

/**
 * Setup the default OpenAI provider
 * Validates API key before creating provider
 */
export function setupOpenAI(): OpenAIProvider {
  const apiKey = requireApiKey("openai")
  const provider = new OpenAIProvider({ apiKey })
  setDefaultProvider(provider)
  return provider
}

/**
 * Setup any available provider (prefers Anthropic)
 */
export function setupAnyProvider(): LLMProvider {
  if (hasApiKey("anthropic")) {
    return setupAnthropic()
  }
  if (hasApiKey("openai")) {
    return setupOpenAI()
  }

  console.error(`\n[Error] No API key found.`)
  console.error(`\nTo run this example, set one of the following:`)
  console.error(`  export ${ENV_KEYS.ANTHROPIC}=your-api-key`)
  console.error(`  export ${ENV_KEYS.OPENAI}=your-api-key\n`)
  process.exit(1)
}

/**
 * Print a section header
 */
export function printHeader(title: string): void {
  console.log(`\n${"=".repeat(50)}`)
  console.log(`  ${title}`)
  console.log(`${"=".repeat(50)}\n`)
}

/**
 * Print a subsection header
 */
export function printSubHeader(title: string): void {
  console.log(`\n--- ${title} ---\n`)
}

/**
 * Run an example with error handling
 */
export async function runExample(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  printHeader(name)

  try {
    await fn()
  } catch (error) {
    console.error(`\n[Error in ${name}]`)
    if (error instanceof Error) {
      // Always show full error message for debugging
      console.error(`  Full error: ${error.message}`)

      // Check for common API errors
      if (error.message.includes("401") || error.message.includes("Invalid API key")) {
        console.error("  API Key Error: Your API key may be invalid or expired.")
        console.error("  Please check your API key and try again.")
      } else if (error.message.includes("429") || error.message.includes("rate limit")) {
        console.error("  Rate Limit Error: Too many requests.")
        console.error("  Please wait a moment and try again.")
      } else if (error.message.includes("500") || error.message.includes("503")) {
        console.error("  Server Error: The API service is temporarily unavailable.")
        console.error("  Please try again later.")
      }
    } else {
      console.error(`  ${String(error)}`)
    }
    throw error
  }
}

/**
 * Process streaming events and print output
 */
export async function processStream(
  receiver: AsyncGenerator<any, void, unknown>,
  options?: {
    showToolCalls?: boolean
    showUsage?: boolean
  }
): Promise<void> {
  const { showToolCalls = true, showUsage = true } = options ?? {}

  for await (const event of receiver) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text)
        break

      case "tool_use":
        if (showToolCalls) {
          console.log(`\n[Tool Call] ${event.name}`)
          console.log(`  Input: ${JSON.stringify(event.input, null, 2)}`)
        }
        break

      case "tool_result":
        if (showToolCalls) {
          const preview = String(event.content).slice(0, 100)
          console.log(`  Result: ${preview}${event.content.length > 100 ? "..." : ""}`)
          if (event.is_error) {
            console.log(`  [Error]`)
          }
        }
        break

      case "stop":
        if (showUsage) {
          console.log(`\n[Usage] ${event.usage.input_tokens} in, ${event.usage.output_tokens} out`)
        }
        break

      case "error":
        console.error(`\n[Error] ${event.error.message}`)
        throw event.error
    }
  }
  console.log()
}

/**
 * Wait for user to press Enter (for interactive examples)
 */
export function waitForEnter(message = "Press Enter to continue..."): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(message)
    process.stdin.once("data", () => {
      resolve()
    })
  })
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Main wrapper with global error handling
 */
export function main(fn: () => Promise<void>): void {
  fn().catch((error) => {
    // Error already logged in runExample, just exit with error code
    process.exit(1)
  })
}
