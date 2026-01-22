/**
 * Example 16: Antigravity Manager
 *
 * Demonstrates how to use Antigravity Manager gateway:
 * - Use OpenAI-compatible API with custom base URL
 * - List available models from /v1/models
 * - Send chat completion requests
 * - Streaming responses
 *
 * Based on: https://github.com/baryon/Antigravity-Manager
 *
 * Environment:
 *   export OPENAI_API_KEY="sk-antigravity"
 *   export OPENAI_BASE_URL="http://127.0.0.1:8045/v1"
 *
 * Or use custom env vars:
 *   export ANTIGRAVITY_API_KEY="sk-antigravity"
 *   export ANTIGRAVITY_BASE_URL="http://127.0.0.1:8045"
 *
 * Run: bun run examples/16-antigravity.ts
 */

import {
  OpenAIProvider,
  createSession,
  prompt,
  setDefaultProvider,
} from "../src"
import { main, runExample, printSubHeader, processStream } from "./_utils"

type AntigravityModelResponse = {
  object?: string
  data?: Array<{
    id?: string
    name?: string
    owned_by?: string
    max_completion_tokens?: number
  }>
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8045"
const DEFAULT_API_KEY = "sk-antigravity"
const DEFAULT_MODEL = "gemini-3-flash"

function getConfig() {
  // Priority: ANTIGRAVITY_* env vars > OPENAI_* env vars > defaults
  const baseUrl = (
    process.env.ANTIGRAVITY_BASE_URL ||
    process.env.OPENAI_BASE_URL?.replace(/\/v1\/?$/, "") ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "")

  const apiKey =
    process.env.ANTIGRAVITY_API_KEY ||
    process.env.OPENAI_API_KEY ||
    DEFAULT_API_KEY

  const model =
    process.env.ANTIGRAVITY_MODEL ||
    DEFAULT_MODEL

  return { baseUrl, apiKey, model }
}

async function fetchModels(baseUrl: string, apiKey: string) {
  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch models: ${res.status} ${text}`)
  }

  return (await res.json()) as AntigravityModelResponse
}

main(async () => {
  const config = getConfig()
  let modelList: string[] = []

  console.log("Antigravity Configuration:")
  console.log(`  Base URL: ${config.baseUrl}`)
  console.log(`  API Key: ${config.apiKey.slice(0, 10)}...`)
  console.log(`  Model: ${config.model}`)
  console.log()

  await runExample("List Available Models", async () => {
    printSubHeader("Fetching /v1/models")

    try {
      const payload = await fetchModels(config.baseUrl, config.apiKey)
      const items = payload.data ?? []

      modelList = items
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id))

      if (modelList.length === 0) {
        console.log("No models returned by the endpoint.")
        return
      }

      console.log(`Total models: ${modelList.length}`)
      console.log("Available models:")
      for (const modelId of modelList.slice(0, 15)) {
        console.log(`  - ${modelId}`)
      }
      if (modelList.length > 15) {
        console.log(`  ... and ${modelList.length - 15} more`)
      }
    } catch (error) {
      console.log(`Failed to fetch models: ${error}`)
      console.log("Continuing with default model...")
    }
  })

  await runExample("Simple Prompt", async () => {
    // Create OpenAI provider pointing to Antigravity gateway
    const provider = new OpenAIProvider({
      apiKey: config.apiKey,
      baseUrl: `${config.baseUrl}/v1`,
    })
    setDefaultProvider(provider)

    const selectedModel = modelList.includes(config.model)
      ? config.model
      : modelList[0] || config.model

    console.log(`Using model: ${selectedModel}`)

    const response = await prompt("你好，请简单自我介绍", {
      model: selectedModel,
    })

    console.log("Response:", response)
  })

  await runExample("Streaming Response", async () => {
    const provider = new OpenAIProvider({
      apiKey: config.apiKey,
      baseUrl: `${config.baseUrl}/v1`,
    })
    setDefaultProvider(provider)

    const selectedModel = modelList.includes(config.model)
      ? config.model
      : modelList[0] || config.model

    console.log(`Using model: ${selectedModel}`)

    await using session = await createSession({ model: selectedModel })

    await session.send({
      role: "user",
      content: "用一句话解释什么是人工智能",
    })

    await processStream(session.receive())
  })

  await runExample("Multi-turn Conversation", async () => {
    const provider = new OpenAIProvider({
      apiKey: config.apiKey,
      baseUrl: `${config.baseUrl}/v1`,
    })
    setDefaultProvider(provider)

    const selectedModel = modelList.includes(config.model)
      ? config.model
      : modelList[0] || config.model

    console.log(`Using model: ${selectedModel}`)

    await using session = await createSession({ model: selectedModel })

    // First turn
    printSubHeader("Turn 1")
    await session.send({
      role: "user",
      content: "我想学习编程，应该从哪里开始？",
    })
    await processStream(session.receive())

    // Second turn
    printSubHeader("Turn 2")
    await session.send({
      role: "user",
      content: "Python和JavaScript哪个更适合初学者？",
    })
    await processStream(session.receive())
  })

  console.log("\n[All examples completed!]")
})
