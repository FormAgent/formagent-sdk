#!/usr/bin/env bun
/**
 * CLI Agent Example - runs the built-in CLI implementation.
 */

import { runCLI } from "../src/cli/cli"

runCLI(process.argv.slice(2)).catch((error) => {
  console.error(error)
  process.exit(1)
})
