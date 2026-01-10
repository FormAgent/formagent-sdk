/**
 * Example 15: Hooks
 *
 * Demonstrates how to use hooks to intercept and control agent behavior:
 * - PreToolUse hooks (block, allow, modify)
 * - PostToolUse hooks (logging)
 * - Permission decisions (allow/deny)
 * - Hook matchers with regex
 * - Chained hooks
 *
 * Run: bun run examples/15-hooks.ts
 */

import {
  createSession,
  builtinTools,
  createHookMatcher,
} from "../src"
import type {
  HookCallback,
  PreToolUseHookInput,
  PostToolUseHookInput,
  HooksConfig,
} from "../src"
import { setupAnthropic, runExample, processStream, main, printSubHeader } from "./_utils"

// ============================================================
// Hook Definitions
// ============================================================

/**
 * Hook to prevent modification of sensitive files like .env
 */
const protectEnvFiles: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {}

  const preInput = input as PreToolUseHookInput
  const filePath = preInput.tool_input?.file_path as string

  if (filePath && (filePath.endsWith(".env") || filePath.includes("/.env"))) {
    return {
      systemMessage: "Environment files are protected and cannot be modified.",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Cannot modify .env files - they contain sensitive configuration",
      },
    }
  }

  return {}
}

/**
 * Hook to block dangerous shell commands
 */
const blockDangerousCommands: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {}

  const preInput = input as PreToolUseHookInput
  const command = preInput.tool_input?.command as string

  if (!command) return {}

  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+\*/,
    /mkfs\./,
    /dd\s+if=.*of=\/dev/,
    />\s*\/dev\/sd/,
    /chmod\s+-R\s+777\s+\//,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Dangerous command blocked: ${command}`,
        },
      }
    }
  }

  return {}
}

/**
 * Hook to log all tool calls for audit purposes
 */
const auditLog: HookCallback = async (input) => {
  const timestamp = new Date().toISOString()

  if (input.hook_event_name === "PreToolUse") {
    const preInput = input as PreToolUseHookInput
    console.log(`  [AUDIT ${timestamp}] Tool called: ${preInput.tool_name}`)
  } else if (input.hook_event_name === "PostToolUse") {
    const postInput = input as PostToolUseHookInput
    console.log(`  [AUDIT ${timestamp}] Tool completed: ${postInput.tool_name}`)
  }

  return {}
}

/**
 * Hook to auto-approve read-only operations
 */
const autoApproveReadOnly: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {}

  const preInput = input as PreToolUseHookInput
  const readOnlyTools = ["Read", "Glob", "Grep"]

  if (readOnlyTools.includes(preInput.tool_name)) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Read-only tool auto-approved",
      },
    }
  }

  return {}
}

// ============================================================
// Examples
// ============================================================

main(async () => {
  // Setup provider (validates API key)
  setupAnthropic()

  // Example 1: Protect sensitive files
  await runExample("Protect Sensitive Files", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [protectEnvFiles],
          },
        ],
      },
    })

    console.log("Attempting to create a .env file...")
    await session.send("Create a .env file with DATABASE_URL=postgres://localhost/test")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Attempting: ${event.name}]`)
      } else if (event.type === "tool_result" && event.is_error) {
        console.log(`[Blocked: ${event.content}]`)
      }
    }
    console.log()
  })

  // Example 2: Block dangerous commands
  await runExample("Block Dangerous Commands", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [blockDangerousCommands],
          },
        ],
      },
    })

    console.log("Attempting dangerous command...")
    await session.send("Run 'rm -rf /' to clean up the system")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Attempting: ${event.name}]`)
      } else if (event.type === "tool_result" && event.is_error) {
        console.log(`[Blocked: ${event.content}]`)
      }
    }
    console.log()
  })

  // Example 3: Audit logging
  await runExample("Audit Logging", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks: {
        PreToolUse: [{ hooks: [auditLog] }],
        PostToolUse: [{ hooks: [auditLog] }],
      },
    })

    await session.send("List files in the current directory using Glob. Be brief.")
    await processStream(session.receive(), { showToolCalls: false })
  })

  // Example 4: Auto-approve read-only tools
  await runExample("Auto-Approve Read-Only Tools", async () => {
    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks: {
        PreToolUse: [
          {
            matcher: "Read|Glob|Grep",
            hooks: [autoApproveReadOnly],
          },
        ],
      },
    })

    await session.send("Find .ts files and show count. Be very brief.")

    for await (const event of session.receive()) {
      if (event.type === "text") {
        process.stdout.write(event.text)
      } else if (event.type === "tool_use") {
        console.log(`\n[Auto-approved: ${event.name}]`)
      }
    }
    console.log()
  })

  // Example 5: Chained hooks
  await runExample("Chained Hooks", async () => {
    let callCount = 0
    const rateLimiter: HookCallback = async (input) => {
      callCount++
      if (callCount > 3) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "Rate limit exceeded (max 3 tool calls)",
          },
        }
      }
      console.log(`  [Rate] Call ${callCount}/3`)
      return {}
    }

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks: {
        PreToolUse: [
          { hooks: [rateLimiter] },
          { hooks: [autoApproveReadOnly] },
        ],
      },
    })

    await session.send("Find .ts files, then read the first 2 you find. Be brief.")
    await processStream(session.receive(), { showToolCalls: false })
  })

  // Example 6: Using createHookMatcher helper
  await runExample("Hook Matcher Helper", async () => {
    const fileSecurityMatcher = createHookMatcher([protectEnvFiles, blockDangerousCommands], {
      matcher: "Write|Edit|Bash",
    })

    const auditMatcher = createHookMatcher([auditLog])

    const hooks: HooksConfig = {
      PreToolUse: [fileSecurityMatcher, auditMatcher],
      PostToolUse: [auditMatcher],
    }

    await using session = await createSession({
      model: "claude-sonnet-4-20250514",
      tools: builtinTools,
      hooks,
    })

    await session.send("Show the current directory structure. Be very brief.")
    await processStream(session.receive(), { showToolCalls: false })
  })

  console.log("\n[All examples completed successfully!]")
})
