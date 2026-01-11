/**
 * Batch tool implementation
 * Executes multiple tool calls in parallel for improved performance
 * @module formagent-sdk/tools/builtin/batch
 */

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { BuiltinToolOptions } from "./types"

/**
 * Single tool call in a batch
 */
export interface BatchToolCall {
  /** Name of the tool to execute */
  tool: string
  /** Parameters for the tool */
  parameters: Record<string, unknown>
}

/**
 * Batch tool input
 */
export interface BatchInput {
  /** Array of tool calls to execute in parallel (max 10) */
  tool_calls: BatchToolCall[]
}

/**
 * Result of a single tool call in batch
 */
export interface BatchCallResult {
  /** Whether the call succeeded */
  success: boolean
  /** Tool name that was called */
  tool: string
  /** Result output (if successful) */
  result?: ToolOutput
  /** Error message (if failed) */
  error?: string
  /** Execution time in ms */
  duration?: number
}

/**
 * Tool resolver function type
 * Returns a tool's execute function given its name
 */
export type BatchToolResolver = (
  toolName: string
) => ((input: Record<string, unknown>, context: ToolContext) => Promise<ToolOutput>) | undefined

// Global tool resolver
let globalToolResolver: BatchToolResolver | null = null

/**
 * Set the global tool resolver for Batch tool
 *
 * This allows Batch to find and execute other tools.
 * Usually set automatically by SessionImpl.
 */
export function setBatchToolResolver(resolver: BatchToolResolver | null): void {
  globalToolResolver = resolver
}

/**
 * Get the current tool resolver
 */
export function getBatchToolResolver(): BatchToolResolver | null {
  return globalToolResolver
}

// Tools that cannot be batched (to prevent infinite loops or dangerous operations)
const DISALLOWED_TOOLS = new Set(["Batch", "batch", "AskUser", "askuser"])

const BATCH_DESCRIPTION = `Execute multiple tool calls in parallel for improved performance.

Use this tool when you need to:
- Read multiple files at once
- Perform several independent operations
- Speed up tasks that don't have dependencies

Parameters:
- tool_calls: Array of tool calls (1-10 calls per batch)
  - tool: Name of the tool to execute
  - parameters: Parameters for that tool

Limitations:
- Maximum 10 tool calls per batch
- Cannot nest Batch calls (no batch within batch)
- Cannot batch AskUser (requires sequential interaction)
- All calls execute in parallel - don't batch dependent operations

Best practices:
- Group independent operations (e.g., reading multiple unrelated files)
- Don't batch operations that depend on each other's results
- Use for bulk file reads, multiple greps, or parallel web fetches

Example:
{
  "tool_calls": [
    { "tool": "Read", "parameters": { "file_path": "/path/to/file1.ts" } },
    { "tool": "Read", "parameters": { "file_path": "/path/to/file2.ts" } },
    { "tool": "Grep", "parameters": { "pattern": "TODO", "path": "./src" } }
  ]
}`

/**
 * Create the Batch tool
 *
 * @param options - Tool options
 * @param toolMap - Optional map of available tools for execution
 */
export function createBatchTool(
  options: BuiltinToolOptions = {},
  toolMap?: Map<string, ToolDefinition>
): ToolDefinition {
  return {
    name: "Batch",
    description: BATCH_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        tool_calls: {
          type: "array",
          description: "Array of tool calls to execute in parallel",
          items: {
            type: "object",
            properties: {
              tool: {
                type: "string",
                description: "Name of the tool to execute",
              },
              parameters: {
                type: "object",
                description: "Parameters for the tool",
                additionalProperties: true,
              },
            },
            required: ["tool", "parameters"],
          },
          minItems: 1,
          maxItems: 10,
        },
      },
      required: ["tool_calls"],
    },
    execute: async (rawInput: Record<string, unknown>, context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as BatchInput
      const { tool_calls } = input

      // Validate input
      if (!tool_calls || !Array.isArray(tool_calls) || tool_calls.length === 0) {
        return {
          content: "Error: At least one tool call is required.",
          isError: true,
        }
      }

      // Limit to 10 calls
      const callsToExecute = tool_calls.slice(0, 10)
      const discardedCalls = tool_calls.slice(10)

      // Execute a single tool call
      const executeCall = async (call: BatchToolCall): Promise<BatchCallResult> => {
        const startTime = Date.now()

        try {
          // Check if tool is disallowed
          if (DISALLOWED_TOOLS.has(call.tool)) {
            return {
              success: false,
              tool: call.tool,
              error: `Tool '${call.tool}' cannot be used in batch. Disallowed: ${Array.from(DISALLOWED_TOOLS).join(", ")}`,
              duration: Date.now() - startTime,
            }
          }

          // Try to find the tool
          let toolExecute: ((input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutput>) | undefined

          // First, check the provided toolMap
          if (toolMap) {
            const tool = toolMap.get(call.tool)
            if (tool) {
              toolExecute = tool.execute
            }
          }

          // Then try global resolver
          if (!toolExecute && globalToolResolver) {
            toolExecute = globalToolResolver(call.tool)
          }

          if (!toolExecute) {
            const availableTools = toolMap ? Array.from(toolMap.keys()).filter((n) => !DISALLOWED_TOOLS.has(n)) : []
            return {
              success: false,
              tool: call.tool,
              error: `Tool '${call.tool}' not found.${availableTools.length > 0 ? ` Available: ${availableTools.slice(0, 10).join(", ")}` : ""}`,
              duration: Date.now() - startTime,
            }
          }

          // Execute the tool
          const result = await toolExecute(call.parameters, context)

          return {
            success: !result.isError,
            tool: call.tool,
            result,
            duration: Date.now() - startTime,
          }
        } catch (error) {
          return {
            success: false,
            tool: call.tool,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
          }
        }
      }

      // Execute all calls in parallel
      const results = await Promise.all(callsToExecute.map(executeCall))

      // Add discarded calls as errors
      for (const call of discardedCalls) {
        results.push({
          success: false,
          tool: call.tool,
          error: "Exceeded maximum of 10 tool calls per batch",
          duration: 0,
        })
      }

      // Count successes and failures
      const successCount = results.filter((r) => r.success).length
      const failCount = results.length - successCount
      const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0)

      // Format output
      const formatResult = (r: BatchCallResult, index: number): string => {
        if (r.success && r.result) {
          const content =
            typeof r.result.content === "string"
              ? r.result.content.slice(0, 500) + (r.result.content.length > 500 ? "..." : "")
              : JSON.stringify(r.result.content).slice(0, 500)
          return `[${index + 1}] ${r.tool}: SUCCESS (${r.duration}ms)\n${content}`
        } else {
          return `[${index + 1}] ${r.tool}: FAILED (${r.duration}ms)\nError: ${r.error}`
        }
      }

      const resultsOutput = results.map(formatResult).join("\n\n---\n\n")

      const summary =
        failCount > 0
          ? `Batch execution: ${successCount}/${results.length} succeeded, ${failCount} failed (${totalDuration}ms total)`
          : `Batch execution: All ${successCount} tools succeeded (${totalDuration}ms total)`

      return {
        content: `${summary}\n\n${resultsOutput}`,
        metadata: {
          totalCalls: results.length,
          successful: successCount,
          failed: failCount,
          totalDuration,
          details: results.map((r) => ({
            tool: r.tool,
            success: r.success,
            duration: r.duration,
            error: r.error,
          })),
        },
      }
    },
  }
}

/**
 * Default Batch tool instance
 */
export const BatchTool = createBatchTool()
