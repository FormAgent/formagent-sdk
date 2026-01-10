/**
 * Example 08: LLM Providers
 *
 * Demonstrates multi-provider support and provider resolution:
 * - Anthropic provider
 * - OpenAI provider
 * - Provider resolver
 * - Model support checking
 * - Custom endpoint configuration
 *
 * Run: bun run examples/08-providers.ts
 */

import {
  createSession,
  prompt,
  AnthropicProvider,
  OpenAIProvider,
  ProviderResolver,
  createProviderResolver,
  setDefaultProvider,
} from "../src"
import {
  hasApiKey,
  requireApiKey,
  runExample,
  processStream,
  main,
  printSubHeader,
} from "./_utils"

main(async () => {
  // Example 1: Using Anthropic provider
  await runExample("Anthropic Provider", async () => {
    if (!hasApiKey("anthropic")) {
      console.log("Skipping: ANTHROPIC_API_KEY not set")
      return
    }

    const anthropic = new AnthropicProvider({
      apiKey: requireApiKey("anthropic"),
    })
    setDefaultProvider(anthropic)

    const response = await prompt("Say 'Hello from Claude!' and nothing else.", {
      model: "claude-3-5-haiku-20241022",
    })
    console.log("Response:", response)
  })

  // Example 2: Using OpenAI provider
  await runExample("OpenAI Provider", async () => {
    if (!hasApiKey("openai")) {
      console.log("Skipping: OPENAI_API_KEY not set")
      return
    }

    const openai = new OpenAIProvider({
      apiKey: requireApiKey("openai"),
    })
    setDefaultProvider(openai)

    const response = await prompt("Say 'Hello from GPT!' and nothing else.", {
      model: "gpt-4-turbo",
    })
    console.log("Response:", response)
  })

  // Example 3: Provider resolver (no API calls needed)
  await runExample("Provider Resolver", async () => {
    const resolver = new ProviderResolver()

    // Register providers (even with placeholder keys for demo)
    if (hasApiKey("anthropic")) {
      resolver.register(
        new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! })
      )
    }
    if (hasApiKey("openai")) {
      resolver.register(
        new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! })
      )
    }

    // Auto-resolve providers based on model name
    const testModels = [
      "claude-3-sonnet",
      "claude-3-5-haiku",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
      "deepseek-chat",
    ]

    console.log("Provider resolution:")
    for (const model of testModels) {
      const provider = resolver.resolveProvider(model)
      console.log(`  ${model} -> ${provider?.name || "(not registered)"}`)
    }
  })

  // Example 4: Create resolver with config (no API calls)
  await runExample("Create Resolver with Config", async () => {
    const resolver = createProviderResolver({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      defaultProviderId: "anthropic",
    })

    console.log("Registered providers:", resolver.getAll().map((p) => p.name))
  })

  // Example 5: Custom patterns (no API calls)
  await runExample("Custom Model Patterns", async () => {
    const resolver = new ProviderResolver()

    if (hasApiKey("openai")) {
      resolver.register(
        new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY!,
          baseUrl: "https://api.together.xyz/v1",
        })
      )
    }

    // Add custom pattern for Together AI models
    resolver.addPattern(/^together-/, "openai")
    resolver.addPattern(/^mistral-/, "openai")

    console.log("Custom patterns added:")
    console.log("  together-* -> openai")
    console.log("  mistral-* -> openai")

    const providerId = resolver.getProviderIdForModel("together-llama-2-70b")
    console.log(`\nProvider for together-llama-2-70b: ${providerId}`)
  })

  // Example 6: Model support checking (no API calls)
  await runExample("Model Support Check", async () => {
    const anthropic = new AnthropicProvider({
      apiKey: "placeholder-for-check",
    })
    const openai = new OpenAIProvider({
      apiKey: "placeholder-for-check",
    })

    const models = [
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-20241022",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
      "o1-preview",
      "deepseek-chat",
    ]

    console.log("Model support matrix:")
    console.log(`${"Model".padEnd(30)} Anthropic  OpenAI`)
    console.log("-".repeat(50))

    for (const model of models) {
      const anthSupport = anthropic.supportsModel(model) ? "    Y" : "    -"
      const openaiSupport = openai.supportsModel(model) ? "    Y" : "    -"
      console.log(`${model.padEnd(30)}${anthSupport}${openaiSupport}`)
    }
  })

  // Example 7: Session with explicit provider
  await runExample("Session with Explicit Provider", async () => {
    if (!hasApiKey("anthropic")) {
      console.log("Skipping: ANTHROPIC_API_KEY not set")
      return
    }

    const anthropic = new AnthropicProvider({
      apiKey: requireApiKey("anthropic"),
    })

    await using session = await createSession({
      model: "claude-3-5-haiku-20241022",
      provider: anthropic,
    })

    await session.send("What model are you? Reply briefly.")
    await processStream(session.receive())
  })

  // Example 8: OpenAI-compatible endpoint config (no API calls)
  await runExample("OpenAI-Compatible Endpoint", async () => {
    // Works with any OpenAI-compatible API
    const localLLM = new OpenAIProvider({
      apiKey: "not-needed-for-local",
      baseUrl: "http://localhost:11434/v1", // Ollama
    })

    console.log("Configured for local LLM:")
    console.log("  Base URL: http://localhost:11434/v1 (Ollama)")
    console.log("  API Key:  (not required for local)")
    console.log(`  Supports gpt-4 pattern: ${localLLM.supportsModel("gpt-4")}`)
  })

  // Example 9: Default provider fallback (no API calls)
  await runExample("Default Provider Fallback", async () => {
    const resolver = new ProviderResolver()

    if (hasApiKey("anthropic")) {
      const anthropic = new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      })
      resolver.setDefaultProvider(anthropic)
    }

    // Unknown models use the default provider
    const provider = resolver.resolveProvider("some-unknown-model")
    console.log("Provider for 'some-unknown-model':", provider?.name || "(none)")
    console.log("(Falls back to default provider)")
  })

  // Example 10: List provider patterns (no API calls)
  await runExample("Provider Patterns", async () => {
    const resolver = new ProviderResolver()
    const patterns = resolver.listPatterns()

    console.log("Default model patterns (first 5):")
    for (const { pattern, providerId } of patterns.slice(0, 5)) {
      console.log(`  ${pattern} -> ${providerId}`)
    }
    console.log(`  ... (${patterns.length} total patterns)`)
  })

  console.log("\n[All examples completed successfully!]")
})
