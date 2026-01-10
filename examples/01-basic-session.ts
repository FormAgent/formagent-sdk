/**
 * Example 01: Basic Session
 *
 * Demonstrates the fundamental session-based API for conversations:
 * - Creating sessions
 * - Sending messages
 * - Receiving streaming responses
 * - Multi-turn conversations
 * - Session lifecycle (close, await using)
 *
 * Run: bun run examples/01-basic-session.ts
 */

import { createSession } from "../src"
import {
  setupAnthropic,
  runExample,
  processStream,
  main,
  printSubHeader,
} from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Basic send/receive pattern
  await runExample("Basic Send/Receive", async () => {
    const session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    try {
      // Send a message
      await session.send("What is 2 + 2? Reply with just the number.")

      // Receive the response (streaming)
      await processStream(session.receive())

      // Show usage
      const usage = session.getUsage()
      console.log(`Total tokens: ${usage.input_tokens} in, ${usage.output_tokens} out`)
    } finally {
      await session.close()
    }
  })

  // Example 2: Multi-turn conversation
  await runExample("Multi-turn Conversation", async () => {
    const session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    try {
      // First turn
      printSubHeader("Turn 1: Introduce yourself")
      await session.send("My name is Alice and I'm learning TypeScript.")
      await processStream(session.receive(), { showUsage: false })

      // Second turn (context is maintained)
      printSubHeader("Turn 2: Ask about context")
      await session.send("What's my name and what am I learning?")
      await processStream(session.receive())
    } finally {
      await session.close()
    }
  })

  // Example 3: Using 'await using' for automatic cleanup
  await runExample("Automatic Cleanup (await using)", async () => {
    // Session is automatically closed when block exits
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("Tell me a very short joke (one line).")
    await processStream(session.receive())

    // No need to call session.close() - it's automatic!
  })

  // Example 4: Custom system prompt
  await runExample("Custom System Prompt", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are a pirate. Always respond in pirate speak. Keep responses short.",
    })

    await session.send("How do I write a for loop in JavaScript?")
    await processStream(session.receive())
  })

  // Example 5: Manual event handling
  await runExample("Manual Event Handling", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("Count from 1 to 5, one number per line.")

    // Manual event processing for more control
    let textContent = ""
    for await (const event of session.receive()) {
      switch (event.type) {
        case "text":
          // Collect text chunks
          textContent += event.text
          process.stdout.write(event.text)
          break

        case "message":
          // Full message object available
          console.log(`\n[Message ID: ${event.message.id}]`)
          break

        case "stop":
          console.log(`[Stop reason: ${event.stop_reason}]`)
          console.log(`[Tokens: ${event.usage.input_tokens} in, ${event.usage.output_tokens} out]`)
          break

        case "error":
          console.error(`[Error: ${event.error.message}]`)
          throw event.error
      }
    }
  })

  console.log("\n[All examples completed successfully!]")
})
