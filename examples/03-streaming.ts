/**
 * Example 03: Streaming
 *
 * Demonstrates real-time streaming of LLM responses:
 * - Basic streaming with session.receive()
 * - Query function streaming
 * - Handling all event types
 * - Aborting streams
 * - Collecting streamed content
 *
 * Run: bun run examples/03-streaming.ts
 */

import { createSession, query } from "../src"
import { setupAnthropic, runExample, main, printSubHeader } from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Basic streaming with session
  await runExample("Basic Session Streaming", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("Count from 1 to 5, one per line.")

    console.log("Streaming response:")
    for await (const event of session.receive()) {
      switch (event.type) {
        case "text":
          process.stdout.write(event.text)
          break
        case "stop":
          console.log(`\n[Done - ${event.usage.output_tokens} tokens]`)
          break
        case "error":
          throw event.error
      }
    }
  })

  // Example 2: Query function streaming
  await runExample("Query Function Streaming", async () => {
    console.log("Streaming response:")

    for await (const output of query("Write a haiku about the ocean.")) {
      switch (output.type) {
        case "text":
          process.stdout.write(output.text)
          break
        case "complete":
          console.log(`\n[Session: ${output.session_id}]`)
          console.log(`[Tokens: ${output.usage.input_tokens} in, ${output.usage.output_tokens} out]`)
          break
        case "error":
          throw output.error
      }
    }
  })

  // Example 3: Handling all event types
  await runExample("All Event Types", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("Say 'Hello!' briefly.")

    for await (const event of session.receive()) {
      // Log each event type
      const preview = JSON.stringify(event).slice(0, 80)
      console.log(`[${event.type}] ${preview}...`)
    }
  })

  // Example 4: Abort streaming
  await runExample("Abort Streaming", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("Tell me a long story about space exploration.")

    const abortController = new AbortController()
    let charCount = 0
    const maxChars = 100

    console.log(`Streaming (will abort after ${maxChars} chars)...`)

    for await (const event of session.receive({ abortSignal: abortController.signal })) {
      if (event.type === "text") {
        process.stdout.write(event.text)
        charCount += event.text.length

        if (charCount >= maxChars) {
          console.log("\n[Aborting...]")
          abortController.abort()
          break
        }
      } else if (event.type === "error") {
        // AbortError is expected when we abort
        if (event.error.name !== "AbortError") {
          throw event.error
        }
      }
    }

    console.log(`[Streamed ${charCount} chars before abort]`)
  })

  // Example 5: Collect full response while streaming
  await runExample("Collect While Streaming", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("What are the three primary colors? Be brief.")

    let fullText = ""
    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
        fullText += event.text
      } else if (event.type === "error") {
        throw event.error
      }
    }

    printSubHeader("Collected Response")
    console.log(`Length: ${fullText.length} characters`)
    console.log(`Content: "${fullText.trim()}"`)
  })

  console.log("\n[All examples completed successfully!]")
})
