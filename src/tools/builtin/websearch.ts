/**
 * WebSearch tool implementation using Exa API
 * @module formagent-sdk/tools/builtin/websearch
 */

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { WebSearchInput, BuiltinToolOptions } from "./types"

const API_CONFIG = {
  BASE_URL: "https://mcp.exa.ai",
  ENDPOINTS: {
    SEARCH: "/mcp",
  },
  DEFAULT_NUM_RESULTS: 8,
  DEFAULT_CONTEXT_MAX_CHARS: 10000,
  TIMEOUT_MS: 30000,
} as const

interface McpSearchRequest {
  jsonrpc: string
  id: number
  method: string
  params: {
    name: string
    arguments: {
      query: string
      numResults?: number
      livecrawl?: "fallback" | "preferred"
      type?: "auto" | "fast" | "deep"
      contextMaxCharacters?: number
    }
  }
}

interface McpSearchResponse {
  jsonrpc: string
  result?: {
    content: Array<{
      type: string
      text: string
    }>
  }
  error?: {
    code: number
    message: string
  }
}

const WEBSEARCH_DESCRIPTION = `Search the web for up-to-date information using Exa AI.

Use this tool when you need to:
- Find current information, news, or recent events
- Look up documentation or technical resources
- Research topics beyond your knowledge cutoff
- Verify facts or get multiple perspectives

The search returns curated, AI-optimized content with context.

Parameters:
- query: The search query (required)
- numResults: Number of results to return (default: 8, max: 20)
- livecrawl: 'fallback' (default) or 'preferred' for fresh content
- type: 'auto' (default), 'fast', or 'deep'
- contextMaxCharacters: Max characters per result (default: 10000)

Best practices:
- Use specific, detailed queries for better results
- For technical topics, include relevant terms and context
- Use 'deep' type for comprehensive research
- Use 'fast' type for quick fact-checking`

/**
 * Create the WebSearch tool
 */
export function createWebSearchTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "WebSearch",
    description: WEBSEARCH_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find relevant information",
        },
        numResults: {
          type: "number",
          description: "Number of search results to return (default: 8, max: 20)",
        },
        livecrawl: {
          type: "string",
          enum: ["fallback", "preferred"],
          description:
            "Live crawl mode - 'fallback': use live crawling as backup, 'preferred': prioritize live crawling",
        },
        type: {
          type: "string",
          enum: ["auto", "fast", "deep"],
          description: "Search type - 'auto': balanced, 'fast': quick results, 'deep': comprehensive",
        },
        contextMaxCharacters: {
          type: "number",
          description: "Maximum characters for context per result (default: 10000)",
        },
      },
      required: ["query"],
    },
    execute: async (rawInput: Record<string, unknown>, context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as WebSearchInput
      const { query, numResults, livecrawl, type, contextMaxCharacters } = input

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        return {
          content: "Error: A non-empty search query is required.",
          isError: true,
        }
      }

      // Clamp numResults to valid range
      const clampedNumResults = Math.min(Math.max(numResults || API_CONFIG.DEFAULT_NUM_RESULTS, 1), 20)

      const searchRequest: McpSearchRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: {
            query: query.trim(),
            numResults: clampedNumResults,
            livecrawl: livecrawl || "fallback",
            type: type || "auto",
            contextMaxCharacters: contextMaxCharacters || API_CONFIG.DEFAULT_CONTEXT_MAX_CHARS,
          },
        },
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS)

      try {
        // Combine with context abort signal if provided
        const signal = context.abortSignal
          ? AbortSignal.any([controller.signal, context.abortSignal])
          : controller.signal

        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`, {
          method: "POST",
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": "FormAgent-SDK/1.0",
          },
          body: JSON.stringify(searchRequest),
          signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          return {
            content: `Search error (${response.status}): ${errorText}`,
            isError: true,
          }
        }

        const responseText = await response.text()

        // Parse SSE response (Exa uses Server-Sent Events format)
        const lines = responseText.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data: McpSearchResponse = JSON.parse(line.substring(6))

              if (data.error) {
                return {
                  content: `Search API error: ${data.error.message}`,
                  isError: true,
                }
              }

              if (data.result?.content && data.result.content.length > 0) {
                const resultText = data.result.content[0].text

                // Format the output with query info
                let output = `## Web Search Results\n\n`
                output += `**Query:** ${query}\n`
                output += `**Results:** ${clampedNumResults} requested\n\n`
                output += `---\n\n`
                output += resultText

                return {
                  content: output,
                }
              }
            } catch (parseError) {
              // Continue to next line if JSON parse fails
              continue
            }
          }
        }

        // Try parsing as regular JSON if not SSE format
        try {
          const data: McpSearchResponse = JSON.parse(responseText)
          if (data.result?.content && data.result.content.length > 0) {
            return {
              content: data.result.content[0].text,
            }
          }
        } catch {
          // Not valid JSON either
        }

        return {
          content: `No search results found for query: "${query}". Please try a different or more specific query.`,
        }
      } catch (error) {
        clearTimeout(timeoutId)

        if (error instanceof Error) {
          if (error.name === "AbortError") {
            return {
              content: `Search request timed out after ${API_CONFIG.TIMEOUT_MS}ms. Please try again or use a simpler query.`,
              isError: true,
            }
          }
          return {
            content: `Search failed: ${error.message}`,
            isError: true,
          }
        }

        return {
          content: `Search failed: ${String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default WebSearch tool instance
 */
export const WebSearchTool = createWebSearchTool()
