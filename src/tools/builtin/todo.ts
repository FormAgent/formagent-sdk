/**
 * TodoWrite tool implementation
 * @module formagent-sdk/tools/builtin/todo
 */

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { TodoWriteInput, TodoItem, BuiltinToolOptions } from "./types"

/**
 * Global todo list storage
 */
let globalTodos: TodoItem[] = []

/**
 * Event callback for todo changes
 */
type TodoChangeCallback = (todos: TodoItem[]) => void
let onTodoChange: TodoChangeCallback | null = null

/**
 * Set callback for todo changes
 */
export function setTodoChangeCallback(callback: TodoChangeCallback | null): void {
  onTodoChange = callback
}

/**
 * Get current todos
 */
export function getTodos(): TodoItem[] {
  return [...globalTodos]
}

/**
 * Clear all todos
 */
export function clearTodos(): void {
  globalTodos = []
  onTodoChange?.(globalTodos)
}

/**
 * Create the TodoWrite tool
 */
export function createTodoWriteTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "TodoWrite",
    description: `Manage a task list to track progress on complex tasks. Use to plan work, track completed items, and show progress to the user.`,
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "Updated todo list",
          items: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "Task description (imperative form, e.g., 'Run tests')",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
                description: "Task status",
              },
              activeForm: {
                type: "string",
                description: "Present continuous form (e.g., 'Running tests')",
              },
            },
            required: ["content", "status", "activeForm"],
          },
        },
      },
      required: ["todos"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as TodoWriteInput
      const { todos } = input

      // Validate todos
      for (const todo of todos) {
        if (!todo.content || !todo.status || !todo.activeForm) {
          return {
            content: "Invalid todo item: missing required fields (content, status, activeForm)",
            isError: true,
          }
        }

        if (!["pending", "in_progress", "completed"].includes(todo.status)) {
          return {
            content: `Invalid status: ${todo.status}. Must be pending, in_progress, or completed.`,
            isError: true,
          }
        }
      }

      // Update global todos
      globalTodos = todos

      // Notify callback
      onTodoChange?.(globalTodos)

      // Format summary
      const completed = todos.filter((t) => t.status === "completed").length
      const inProgress = todos.filter((t) => t.status === "in_progress").length
      const pending = todos.filter((t) => t.status === "pending").length

      const lines: string[] = [
        `Todo list updated (${completed}/${todos.length} completed)`,
        "",
      ]

      for (const todo of todos) {
        const icon =
          todo.status === "completed" ? "✓" :
          todo.status === "in_progress" ? "→" : "○"
        lines.push(`${icon} ${todo.content}`)
      }

      if (inProgress > 0) {
        lines.push("")
        lines.push(`Currently: ${todos.find((t) => t.status === "in_progress")?.activeForm}`)
      }

      return {
        content: lines.join("\n"),
      }
    },
  }
}

/**
 * Default TodoWrite tool instance
 */
export const TodoWriteTool = createTodoWriteTool()
