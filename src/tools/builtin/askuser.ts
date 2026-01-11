/**
 * AskUser tool implementation
 * Allows the agent to ask questions and get user input
 * @module formagent-sdk/tools/builtin/askuser
 */

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { BuiltinToolOptions } from "./types"

/**
 * Question definition for AskUser tool
 */
export interface AskUserQuestion {
  /** The question text to display to the user */
  question: string
  /** Short label for the question (displayed as header) */
  header?: string
  /** Available options for the user to choose from */
  options?: AskUserOption[]
  /** Allow multiple selections (default: false) */
  multiSelect?: boolean
  /** Default value if user doesn't respond */
  defaultValue?: string
}

/**
 * Option for a question
 */
export interface AskUserOption {
  /** Display label for the option */
  label: string
  /** Description of what this option means */
  description?: string
  /** Value to return if selected (defaults to label) */
  value?: string
}

/**
 * AskUser tool input
 */
export interface AskUserInput {
  /** Questions to ask the user (1-4 questions) */
  questions: AskUserQuestion[]
}

/**
 * User's answer to a question
 */
export type AskUserAnswer = string | string[] | undefined

/**
 * Callback function type for handling user questions
 * SDK users must provide this to enable the AskUser tool
 */
export type AskUserHandler = (
  questions: AskUserQuestion[],
  context: ToolContext
) => Promise<AskUserAnswer[]>

// Global handler storage
let globalAskUserHandler: AskUserHandler | null = null

/**
 * Set the global AskUser handler
 *
 * This must be called before using the AskUser tool.
 * The handler receives questions and should return user's answers.
 *
 * @example
 * ```ts
 * import { setAskUserHandler } from "formagent-sdk"
 * import * as readline from "readline"
 *
 * // Simple CLI handler
 * setAskUserHandler(async (questions) => {
 *   const rl = readline.createInterface({
 *     input: process.stdin,
 *     output: process.stdout,
 *   })
 *
 *   const answers: (string | undefined)[] = []
 *   for (const q of questions) {
 *     const answer = await new Promise<string>((resolve) => {
 *       rl.question(`${q.question} `, resolve)
 *     })
 *     answers.push(answer || undefined)
 *   }
 *   rl.close()
 *   return answers
 * })
 * ```
 */
export function setAskUserHandler(handler: AskUserHandler | null): void {
  globalAskUserHandler = handler
}

/**
 * Get the current AskUser handler
 */
export function getAskUserHandler(): AskUserHandler | null {
  return globalAskUserHandler
}

const ASKUSER_DESCRIPTION = `Ask the user questions to gather information, clarify requirements, or get decisions.

Use this tool when you need to:
- Gather user preferences or requirements
- Clarify ambiguous instructions
- Get decisions on implementation choices
- Offer choices about what direction to take

Parameters:
- questions: Array of questions (1-4 questions per call)
  - question: The question text (required)
  - header: Short label for display (optional)
  - options: Array of choices (optional)
    - label: Display text
    - description: Explanation of the option
  - multiSelect: Allow multiple selections (default: false)
  - defaultValue: Default if no response

Best practices:
- Keep questions clear and concise
- Provide options when there are known choices
- Use multiSelect for non-mutually-exclusive options
- Limit to 4 questions per call to avoid overwhelming the user`

/**
 * Create the AskUser tool
 */
export function createAskUserTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "AskUser",
    description: ASKUSER_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Questions to ask the user (1-4 questions)",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question text to display",
              },
              header: {
                type: "string",
                description: "Short label for the question (max 12 chars)",
              },
              options: {
                type: "array",
                description: "Available choices (2-4 options)",
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description: "Display text for this option",
                    },
                    description: {
                      type: "string",
                      description: "Explanation of what this option means",
                    },
                  },
                  required: ["label"],
                },
              },
              multiSelect: {
                type: "boolean",
                description: "Allow multiple selections (default: false)",
              },
              defaultValue: {
                type: "string",
                description: "Default value if user doesn't respond",
              },
            },
            required: ["question"],
          },
          minItems: 1,
          maxItems: 4,
        },
      },
      required: ["questions"],
    },
    execute: async (rawInput: Record<string, unknown>, context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as AskUserInput
      const { questions } = input

      // Validate questions
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return {
          content: "Error: At least one question is required.",
          isError: true,
        }
      }

      if (questions.length > 4) {
        return {
          content: "Error: Maximum 4 questions per call. Please split into multiple calls.",
          isError: true,
        }
      }

      // Check if handler is set
      if (!globalAskUserHandler) {
        return {
          content: `Error: AskUser handler not configured. The SDK user must call setAskUserHandler() to enable user interaction.

Questions that would have been asked:
${questions.map((q, i) => `${i + 1}. ${q.question}${q.options ? ` [Options: ${q.options.map((o) => o.label).join(", ")}]` : ""}`).join("\n")}

To enable this tool, the SDK user should implement an AskUser handler.`,
          isError: true,
        }
      }

      try {
        // Call the handler to get user answers
        const answers = await globalAskUserHandler(questions, context)

        // Format the response
        const formatAnswer = (answer: AskUserAnswer): string => {
          if (answer === undefined || answer === null) return "(no answer)"
          if (Array.isArray(answer)) return answer.join(", ") || "(no answer)"
          return answer || "(no answer)"
        }

        const formattedAnswers = questions
          .map((q, i) => `Q: "${q.question}"\nA: ${formatAnswer(answers[i])}`)
          .join("\n\n")

        return {
          content: `User has answered your questions:\n\n${formattedAnswers}\n\nYou can now continue with the user's answers in mind.`,
          metadata: {
            questions: questions.map((q) => q.question),
            answers,
          },
        }
      } catch (error) {
        return {
          content: `Error getting user response: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default AskUser tool instance
 */
export const AskUserTool = createAskUserTool()
