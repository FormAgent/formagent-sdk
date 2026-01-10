/**
 * Example 07: Cost Tracking
 *
 * Demonstrates token usage tracking and cost calculation:
 * - Basic cost tracking
 * - Message deduplication
 * - Usage by model
 * - Session-specific tracking
 * - Cache token tracking
 * - Custom pricing
 *
 * Run: bun run examples/07-cost-tracking.ts
 */

import {
  createSession,
  CostTrackerImpl,
  createCostTracker,
  DEFAULT_PRICING,
} from "../src"
import type { PricingConfig } from "../src"
import { setupAnthropic, runExample, processStream, main, printSubHeader } from "./_utils"

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Basic cost tracking
  await runExample("Basic Cost Tracking", async () => {
    const tracker = new CostTrackerImpl()

    // Simulate processing messages
    tracker.processMessage("msg-1", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
    })

    tracker.processMessage("msg-2", "claude-3-sonnet", {
      input_tokens: 2000,
      output_tokens: 1000,
    })

    // Get total usage
    const usage = tracker.getTotalUsage()
    console.log("Total usage:")
    console.log(`  Input tokens:  ${usage.totalInputTokens.toLocaleString()}`)
    console.log(`  Output tokens: ${usage.totalOutputTokens.toLocaleString()}`)
    console.log(`  Total cost:    $${usage.totalCostUsd.toFixed(4)}`)
    console.log(`  API calls:     ${usage.callCount}`)
  })

  // Example 2: Message deduplication
  await runExample("Message Deduplication", async () => {
    const tracker = new CostTrackerImpl({ deduplication: true })

    // Process same message twice
    tracker.processMessage("msg-1", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
    })

    tracker.processMessage("msg-1", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
    })

    console.log(`Messages processed: ${tracker.getRecords().length}`)
    console.log("(Duplicate was ignored - prevents double counting)")
  })

  // Example 3: Usage by model
  await runExample("Usage by Model", async () => {
    const tracker = new CostTrackerImpl()

    tracker.processMessage("msg-1", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
    })

    tracker.processMessage("msg-2", "claude-3-haiku", {
      input_tokens: 2000,
      output_tokens: 1000,
    })

    tracker.processMessage("msg-3", "gpt-4-turbo", {
      input_tokens: 1500,
      output_tokens: 750,
    })

    const usage = tracker.getTotalUsage()
    console.log("Usage by model:")
    for (const [model, stats] of Object.entries(usage.byModel)) {
      console.log(`\n  ${model}:`)
      console.log(`    Input:  ${stats.inputTokens.toLocaleString()} tokens`)
      console.log(`    Output: ${stats.outputTokens.toLocaleString()} tokens`)
      console.log(`    Cost:   $${stats.cost.toFixed(4)}`)
      console.log(`    Calls:  ${stats.calls}`)
    }
  })

  // Example 4: Session-specific tracking
  await runExample("Session Tracking", async () => {
    const tracker = new CostTrackerImpl()

    // Track messages with session IDs
    tracker.processMessage("msg-1", "claude-3-sonnet", { input_tokens: 500, output_tokens: 200 }, "session-a")
    tracker.processMessage("msg-2", "claude-3-sonnet", { input_tokens: 1000, output_tokens: 400 }, "session-a")
    tracker.processMessage("msg-3", "claude-3-sonnet", { input_tokens: 800, output_tokens: 300 }, "session-b")

    printSubHeader("Session A")
    const sessionAUsage = tracker.getSessionUsage("session-a")
    console.log(`  Tokens: ${sessionAUsage?.totalInputTokens} in, ${sessionAUsage?.totalOutputTokens} out`)
    console.log(`  Cost:   $${sessionAUsage?.totalCostUsd.toFixed(4)}`)

    printSubHeader("Session B")
    const sessionBUsage = tracker.getSessionUsage("session-b")
    console.log(`  Tokens: ${sessionBUsage?.totalInputTokens} in, ${sessionBUsage?.totalOutputTokens} out`)
    console.log(`  Cost:   $${sessionBUsage?.totalCostUsd.toFixed(4)}`)
  })

  // Example 5: Cache token tracking
  await runExample("Cache Token Tracking", async () => {
    const tracker = new CostTrackerImpl()

    // First message: create cache
    tracker.processMessage("msg-1", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 5000,
      cache_read_input_tokens: 0,
    })

    // Second message: read from cache
    tracker.processMessage("msg-2", "claude-3-sonnet", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 5000,
    })

    const usage = tracker.getTotalUsage()
    console.log("Cache usage:")
    console.log(`  Cache creation: ${usage.totalCacheCreationTokens.toLocaleString()} tokens`)
    console.log(`  Cache read:     ${usage.totalCacheReadTokens.toLocaleString()} tokens`)
    console.log(`  Total cost:     $${usage.totalCostUsd.toFixed(4)}`)
  })

  // Example 6: Custom pricing
  await runExample("Custom Pricing", async () => {
    const customPricing: PricingConfig = {
      models: {
        "my-custom-model": {
          inputPricePerMillion: 0.5,
          outputPricePerMillion: 1.5,
        },
      },
      default: {
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 3.0,
      },
    }

    const tracker = createCostTracker({ pricing: customPricing })

    tracker.processMessage("msg-1", "my-custom-model", {
      input_tokens: 1000000, // 1M tokens
      output_tokens: 500000, // 500K tokens
    })

    console.log(`Custom model pricing:`)
    console.log(`  Input:  $0.50 per 1M tokens`)
    console.log(`  Output: $1.50 per 1M tokens`)
    console.log(`\nCalculated cost: $${tracker.getTotalCost().toFixed(2)}`)
  })

  // Example 7: Real session with cost tracking
  await runExample("Real Session Cost", async () => {
    const tracker = new CostTrackerImpl()

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
    })

    await session.send("What is 2+2? Reply with just the number.")
    await processStream(session.receive(), { showUsage: false })

    // Get usage from session and track it
    const usage = session.getUsage()
    tracker.processMessage(
      `session-${session.id}-msg-1`,
      "claude-3-sonnet",
      usage,
      session.id
    )

    console.log(`\nSession tokens: ${usage.input_tokens} in, ${usage.output_tokens} out`)
    console.log(`Session cost:   $${tracker.getTotalCost().toFixed(6)}`)
  })

  // Example 8: Show default pricing
  await runExample("Default Pricing Reference", async () => {
    console.log("Anthropic model pricing:")

    const anthropic = DEFAULT_PRICING.providers?.anthropic
    if (anthropic) {
      for (const [model, pricing] of Object.entries(anthropic)) {
        console.log(`\n  ${model}:`)
        console.log(`    Input:  $${pricing.inputPricePerMillion}/1M tokens`)
        console.log(`    Output: $${pricing.outputPricePerMillion}/1M tokens`)
      }
    }
  })

  console.log("\n[All examples completed successfully!]")
})
