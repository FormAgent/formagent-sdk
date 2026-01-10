/**
 * Example 02: Prompt Function
 *
 * Demonstrates the simple prompt() function for single-turn interactions:
 * - Basic prompts (returns string)
 * - Full result with usage info
 * - Custom model and temperature
 * - System prompts
 *
 * Run: bun run examples/02-prompt-function.ts
 */

import { prompt } from "../src"
import { setupAnthropic, runExample, main } from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Simple prompt (returns string)
  await runExample("Simple Prompt", async () => {
    const response = await prompt("What is the capital of France? Reply with just the city name.")
    console.log("Response:", response)
  })

  // Example 2: With system prompt
  await runExample("With System Prompt", async () => {
    const response = await prompt("How should I greet someone?", {
      systemPrompt: "You are a pirate. Respond in pirate speak. Keep it short.",
    })
    console.log("Response:", response)
  })

  // Example 3: With custom model
  await runExample("Custom Model", async () => {
    const response = await prompt("What is 2 + 2? Reply with just the number.", {
      model: "claude-3-5-haiku-20241022",
    })
    console.log("Response:", response)
  })

  // Example 4: With temperature control
  await runExample("Temperature Control", async () => {
    console.log("Creative (temp=1.0):")
    const creative = await prompt("Give me a creative name for a pet rock.", {
      temperature: 1.0,
    })
    console.log(`  ${creative}`)

    console.log("\nConservative (temp=0.1):")
    const conservative = await prompt("Give me a creative name for a pet rock.", {
      temperature: 0.1,
    })
    console.log(`  ${conservative}`)
  })

  // Example 5: With max tokens
  await runExample("Max Tokens Limit", async () => {
    const response = await prompt("Tell me about the history of computers.", {
      maxTokens: 50,
    })
    console.log("Response (max 50 tokens):")
    console.log(response)
  })

  // Example 6: Full result with usage info
  await runExample("Full Result with Usage", async () => {
    const result = await prompt("What is 10 + 20? Reply with just the number.", {
      textOnly: false,
    })

    console.log("Content:", result.text)
    console.log("Usage:", result.usage)
    console.log("Session ID:", result.sessionId)
  })

  console.log("\n[All examples completed successfully!]")
})
