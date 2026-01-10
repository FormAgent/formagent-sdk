/**
 * Environment variable utilities
 * @module formagent-sdk/utils/env
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Load .env file and override process.env with its values
 * This ensures .env values take precedence over shell environment variables
 *
 * @param cwd - Working directory to search for .env file (defaults to process.cwd())
 */
export function loadEnvOverride(cwd?: string): void {
  const dir = cwd || process.cwd()
  const envPath = join(dir, ".env")

  if (!existsSync(envPath)) {
    return
  }

  try {
    const content = readFileSync(envPath, "utf-8")
    const lines = content.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue
      }

      // Parse key=value
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, eqIndex).trim()
      let value = trimmed.slice(eqIndex + 1).trim()

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // Override process.env
      process.env[key] = value
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Get provider-specific environment variables
 */
export function getProviderEnv() {
  return {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      model: process.env.ANTHROPIC_MODEL,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
    },
  }
}
