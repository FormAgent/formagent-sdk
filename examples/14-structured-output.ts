/**
 * Example 14: Structured Output
 *
 * Demonstrates how to use structured output to get validated JSON responses:
 * - JSON Schema output format
 * - Zod schema support
 * - Result event with structured_output
 * - Error handling for invalid output
 *
 * Run: bun run examples/14-structured-output.ts
 */

import { createSession, builtinTools } from "../src"
import type { OutputFormat } from "../src"
import { z } from "zod"
import { setupAnthropic, runExample, main, printSubHeader } from "./_utils"

// Helper to convert Zod schema to JSON Schema (simplified)
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as any)._def

  if (def.typeName === "ZodObject") {
    const shape = def.shape()
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const propDef = (value as any)._def
      properties[key] = zodDefToJsonSchema(propDef)
      if (propDef.typeName !== "ZodOptional") {
        required.push(key)
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  return { type: "object" }
}

function zodDefToJsonSchema(def: any): Record<string, unknown> {
  switch (def.typeName) {
    case "ZodString":
      return { type: "string", description: def.description }
    case "ZodNumber":
      return { type: "number", description: def.description }
    case "ZodBoolean":
      return { type: "boolean", description: def.description }
    case "ZodArray":
      return { type: "array", items: zodDefToJsonSchema(def.type._def), description: def.description }
    case "ZodEnum":
      return { type: "string", enum: def.values, description: def.description }
    case "ZodOptional":
      return zodDefToJsonSchema(def.innerType._def)
    default:
      return {}
  }
}

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Basic JSON Schema Output
  await runExample("Basic JSON Schema Output", async () => {
    const companySchema = {
      type: "object",
      properties: {
        company_name: { type: "string", description: "Name of the company" },
        founded_year: { type: "number", description: "Year founded" },
        headquarters: { type: "string", description: "HQ city" },
        employees: { type: "number", description: "Number of employees" },
      },
      required: ["company_name"],
    }

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      outputFormat: {
        type: "json_schema",
        schema: companySchema,
      },
    })

    await session.send("Tell me about Anthropic as a company. Be brief.")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "result") {
        if (event.subtype === "success" && event.structured_output) {
          printSubHeader("Parsed Output")
          console.log(JSON.stringify(event.structured_output, null, 2))
        } else if (event.subtype === "error_max_structured_output_retries") {
          console.error("\n[Failed to produce valid structured output]")
        }
      } else if (event.type === "error") {
        throw event.error
      }
    }
    console.log()
  })

  // Example 2: Zod Schema with Code Analysis
  await runExample("Zod Schema Code Analysis", async () => {
    const IssueSchema = z.object({
      severity: z.enum(["low", "medium", "high"]).describe("Issue severity"),
      description: z.string().describe("Description"),
      file: z.string().describe("File path"),
    })

    const AnalysisSchema = z.object({
      summary: z.string().describe("Summary"),
      issues: z.array(IssueSchema).describe("Issues found"),
      score: z.number().describe("Quality score 0-100"),
    })

    const schema = zodToJsonSchema(AnalysisSchema)

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      outputFormat: {
        type: "json_schema",
        schema: schema as any,
      },
    })

    await session.send("Analyze package.json briefly. List 1-2 minor issues if any.")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Tool: ${event.name}]`)
      } else if (event.type === "result") {
        if (event.subtype === "success" && event.structured_output) {
          const result = event.structured_output as z.infer<typeof AnalysisSchema>

          printSubHeader("Analysis Result")
          console.log(`Summary: ${result.summary}`)
          console.log(`Score: ${result.score}/100`)

          if (result.issues?.length > 0) {
            console.log("\nIssues:")
            for (const issue of result.issues) {
              console.log(`  [${issue.severity.toUpperCase()}] ${issue.file}: ${issue.description}`)
            }
          }
        }
      } else if (event.type === "error") {
        throw event.error
      }
    }
    console.log()
  })

  // Example 3: TODO Extraction
  await runExample("TODO Extraction", async () => {
    const todoSchema = {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "TODO text" },
              file: { type: "string", description: "File path" },
              line: { type: "number", description: "Line number" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["text", "file", "line"],
          },
        },
        total_count: { type: "number" },
      },
      required: ["todos", "total_count"],
    }

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      outputFormat: {
        type: "json_schema",
        schema: todoSchema,
      },
    })

    await session.send("Find TODO comments in src/ (just check a few files). List max 3.")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Tool: ${event.name}]`)
      } else if (event.type === "result") {
        if (event.subtype === "success" && event.structured_output) {
          const data = event.structured_output as {
            todos: Array<{ text: string; file: string; line: number; priority?: string }>
            total_count: number
          }

          printSubHeader("Extracted TODOs")
          console.log(`Found ${data.total_count} TODOs`)

          if (data.todos?.length > 0) {
            for (const todo of data.todos) {
              const priority = todo.priority ? `[${todo.priority.toUpperCase()}]` : ""
              console.log(`  ${priority} ${todo.file}:${todo.line}`)
              console.log(`    ${todo.text}`)
            }
          }
        }
      } else if (event.type === "error") {
        throw event.error
      }
    }
    console.log()
  })

  console.log("\n[All examples completed successfully!]")
})
