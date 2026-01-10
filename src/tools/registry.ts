import type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolEvent,
  ToolRegistry as ToolRegistryInterface,
} from "../types"

export class ToolRegistry implements ToolRegistryInterface {
  private tools: Map<string, ToolDefinition> = new Map()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool)
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId)
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId)
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  clear(): void {
    this.tools.clear()
  }

  async execute(toolId: string, input: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolId)
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    context.notify?.({ type: "start", toolId, toolName: tool.name, input })

    try {
      const result = await tool.execute(input, context)
      context.notify?.({ type: "result", toolId, result })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      context.notify?.({ type: "error", toolId, error: errorMessage })
      throw error
    }
  }
}
