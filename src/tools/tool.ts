/**
 * Tool helper function for defining custom tools
 * @module formagent-sdk/tools/tool
 */

import type {
  ToolDefinition,
  ToolContext,
  ToolOutput,
  ZodLikeSchema,
} from "../types/tool"
import type { JSONSchema } from "../types/core"

/**
 * Tool options for the tool() helper
 */
export interface ToolHelperOptions<TInput = Record<string, unknown>> {
  /** Tool name (must be unique) */
  name: string
  /** Tool description (shown to the model) */
  description: string
  /** Input schema (JSON Schema or Zod schema) */
  schema: JSONSchema | ZodLikeSchema<TInput>
  /** Tool execution function */
  execute: (input: TInput, context: ToolContext) => Promise<ToolOutput | string>
}

/**
 * Create a tool definition
 *
 * Supports two signatures:
 *
 * 1. Options object (recommended):
 * ```ts
 * const weatherTool = tool({
 *   name: "get_weather",
 *   description: "Get weather",
 *   schema: z.object({ location: z.string() }),
 *   execute: async ({ location }) => `Weather in ${location}`,
 * })
 * ```
 *
 * 2. Claude SDK style (positional arguments):
 * ```ts
 * const weatherTool = tool(
 *   "get_weather",
 *   "Get weather",
 *   { location: z.string() },
 *   async ({ location }) => `Weather in ${location}`
 * )
 * ```
 *
 * @example
 * ```ts
 * import { z } from "zod"
 *
 * // Style 1: Options object
 * const weatherTool = tool({
 *   name: "get_weather",
 *   description: "Get the current weather for a location",
 *   schema: z.object({
 *     location: z.string().describe("City name"),
 *     unit: z.enum(["celsius", "fahrenheit"]).optional(),
 *   }),
 *   async execute({ location, unit = "celsius" }) {
 *     return `Weather in ${location}: 20°${unit === "celsius" ? "C" : "F"}`
 *   },
 * })
 *
 * // Style 2: Claude SDK style
 * const calculatorTool = tool(
 *   "calculate",
 *   "Perform math calculation",
 *   { expression: z.string().describe("Math expression") },
 *   async ({ expression }) => {
 *     return { content: [{ type: "text", text: `Result: ${eval(expression)}` }] }
 *   }
 * )
 * ```
 */
// Overload 1: Options object
export function tool<TInput = Record<string, unknown>>(
  options: ToolHelperOptions<TInput>
): ToolDefinition<TInput>

// Overload 2: Claude SDK style (positional arguments)
export function tool<TInput = Record<string, unknown>>(
  name: string,
  description: string,
  schema: JSONSchema | ZodLikeSchema<TInput>,
  execute: (input: TInput, context: ToolContext) => Promise<ToolOutput | string>
): ToolDefinition<TInput>

// Implementation
export function tool<TInput = Record<string, unknown>>(
  nameOrOptions: string | ToolHelperOptions<TInput>,
  description?: string,
  schema?: JSONSchema | ZodLikeSchema<TInput>,
  execute?: (input: TInput, context: ToolContext) => Promise<ToolOutput | string>
): ToolDefinition<TInput> {
  // Handle positional arguments (Claude SDK style)
  let options: ToolHelperOptions<TInput>
  if (typeof nameOrOptions === "string") {
    if (!description || !schema || !execute) {
      throw new Error("tool() requires description, schema, and execute when using positional arguments")
    }
    options = {
      name: nameOrOptions,
      description,
      schema,
      execute,
    }
  } else {
    options = nameOrOptions
  }

  const toolName = options.name
  const toolDescription = options.description
  const toolSchema = options.schema
  const toolExecute = options.execute

  // Convert Zod schema to JSON Schema if needed
  const jsonSchema = isZodSchema(toolSchema) ? zodToJsonSchema(toolSchema) : toolSchema

  return {
    name: toolName,
    description: toolDescription,
    inputSchema: jsonSchema,
    execute: async (input: TInput, context: ToolContext): Promise<ToolOutput> => {
      // Validate input with Zod if applicable
      if (isZodSchema(toolSchema)) {
        const parseResult = toolSchema.safeParse(input)
        if (!parseResult.success) {
          return {
            content: `Validation error: ${JSON.stringify(parseResult.error)}`,
            isError: true,
          }
        }
        input = parseResult.data
      }

      // Execute the tool
      const result = await toolExecute(input, context)

      // Normalize result
      if (typeof result === "string") {
        return { content: result }
      }

      return result
    },
  }
}

/**
 * Check if a schema is a Zod-like schema
 */
function isZodSchema<T>(schema: unknown): schema is ZodLikeSchema<T> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    "safeParse" in schema &&
    typeof (schema as any).parse === "function" &&
    typeof (schema as any).safeParse === "function"
  )
}

/**
 * Convert a Zod schema to JSON Schema
 *
 * This is a simplified conversion that handles common cases.
 * For full Zod-to-JSON-Schema conversion, use a library like zod-to-json-schema.
 */
export function zodToJsonSchema(zodSchema: ZodLikeSchema): JSONSchema {
  // Try to access Zod's internal shape
  const def = (zodSchema as any)._def
  const typeName = def?.typeName

  if (typeName === "ZodObject") {
    // In Zod v3, shape can be a function or an object
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape
    if (shape) {
      return objectShapeToJsonSchema(shape)
    }
  }

  // Fallback: return a generic object schema
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  }
}

/**
 * Convert Zod object shape to JSON Schema properties
 */
function objectShapeToJsonSchema(shape: Record<string, any>): JSONSchema {
  const properties: Record<string, JSONSchema> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const def = value?._def
    let typeName = def?.typeName

    // Get description (may be at different levels depending on wrapping)
    let description = def?.description

    // Handle optional/default wrappers - unwrap to get the inner type
    let innerDef = def
    let isOptional = false

    // Keep unwrapping until we get to the actual type
    while (innerDef) {
      const innerTypeName = innerDef.typeName

      if (innerTypeName === "ZodOptional") {
        isOptional = true
        // Preserve description from outer wrapper if inner doesn't have one
        if (!description && innerDef.description) {
          description = innerDef.description
        }
        innerDef = innerDef.innerType?._def
      } else if (innerTypeName === "ZodDefault") {
        // Default values make the field optional from the caller's perspective
        isOptional = true
        if (!description && innerDef.description) {
          description = innerDef.description
        }
        innerDef = innerDef.innerType?._def
      } else if (innerTypeName === "ZodNullable") {
        if (!description && innerDef.description) {
          description = innerDef.description
        }
        innerDef = innerDef.innerType?._def
      } else {
        // Found the actual type, check for description
        if (!description && innerDef.description) {
          description = innerDef.description
        }
        break
      }
    }

    // Convert type
    const prop = zodDefToJsonSchema(innerDef)
    if (description) {
      prop.description = description
    }

    properties[key] = prop

    if (!isOptional) {
      required.push(key)
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  }
}

/**
 * Convert a Zod definition to JSON Schema
 */
function zodDefToJsonSchema(def: any): JSONSchema {
  const typeName = def?.typeName

  switch (typeName) {
    case "ZodString":
      return { type: "string" }
    case "ZodNumber":
      return { type: "number" }
    case "ZodBoolean":
      return { type: "boolean" }
    case "ZodEnum":
      return { type: "string", enum: def.values }
    case "ZodArray":
      return {
        type: "array",
        items: zodDefToJsonSchema(def.type?._def),
      }
    case "ZodObject": {
      // In Zod v3, shape can be a function or an object
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape
      return objectShapeToJsonSchema(shape)
    }
    case "ZodLiteral":
      return { type: typeof def.value, enum: [def.value] }
    case "ZodUnion":
      return {
        oneOf: def.options?.map((opt: any) => zodDefToJsonSchema(opt._def)),
      }
    case "ZodOptional":
      return zodDefToJsonSchema(def.innerType?._def)
    case "ZodDefault":
      return zodDefToJsonSchema(def.innerType?._def)
    case "ZodNullable":
      const inner = zodDefToJsonSchema(def.innerType?._def)
      return { ...inner, nullable: true }
    default:
      return {}
  }
}

/**
 * Create a simple string tool (no parameters)
 *
 * @param name - Tool name
 * @param description - Tool description
 * @param execute - Execution function
 * @returns ToolDefinition
 *
 * @example
 * ```ts
 * const timeTool = simpleTool(
 *   "get_time",
 *   "Get the current time",
 *   async () => new Date().toISOString()
 * )
 * ```
 */
export function simpleTool(
  name: string,
  description: string,
  execute: (context: ToolContext) => Promise<string>
): ToolDefinition<Record<string, never>> {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {},
    },
    execute: async (_input: Record<string, never>, context: ToolContext): Promise<ToolOutput> => {
      const result = await execute(context)
      return { content: result }
    },
  }
}
