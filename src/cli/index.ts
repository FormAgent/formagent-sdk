#!/usr/bin/env node
/**
 * FormAgent CLI - Interactive AI Agent
 *
 * Usage:
 *   npx formagent              # Start interactive mode
 *   npx formagent "question"   # Quick query mode
 *   npx formagent --help       # Show help
 *
 * @module formagent-sdk/cli
 */

import { runCLI } from "./cli"

// Run CLI
runCLI(process.argv.slice(2)).catch((error) => {
  console.error(`\x1b[31mFatal error: ${error.message}\x1b[0m`)
  process.exit(1)
})
