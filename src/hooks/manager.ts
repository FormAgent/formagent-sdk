/**
 * Hooks manager for intercepting and controlling agent behavior
 * @module formagent-sdk/hooks/manager
 */

import type {
  HooksConfig,
  HookCallback,
  HookMatcher,
  HookInput,
  HookOutput,
  HookContext,
  HookEventName,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PermissionDecision,
} from "../types/hooks"

/**
 * Result of running PreToolUse hooks
 */
export interface PreToolUseResult {
  /** Whether to allow the tool execution */
  allowed: boolean
  /** Permission decision (allow/deny/ask) */
  decision: PermissionDecision
  /** Reason for the decision */
  reason?: string
  /** Updated tool input (if modified by hook) */
  updatedInput?: Record<string, unknown>
  /** System message to inject */
  systemMessage?: string
  /** Whether to continue execution */
  continue: boolean
  /** Stop reason if continue is false */
  stopReason?: string
}

/**
 * Result of running PostToolUse hooks
 */
export interface PostToolUseResult {
  /** Additional context to add */
  additionalContext?: string
  /** System message to inject */
  systemMessage?: string
  /** Whether to continue execution */
  continue: boolean
  /** Stop reason if continue is false */
  stopReason?: string
}

/**
 * Hook timeout error
 */
export class HookTimeoutError extends Error {
  constructor(hookName: string, timeout: number) {
    super(`Hook "${hookName}" timed out after ${timeout}ms`)
    this.name = "HookTimeoutError"
  }
}

/**
 * Hooks manager for executing hooks at various lifecycle points
 */
export class HooksManager {
  private config: HooksConfig
  private sessionId: string
  private cwd: string

  constructor(config: HooksConfig, sessionId: string, cwd: string = process.cwd()) {
    this.config = config
    this.sessionId = sessionId
    this.cwd = cwd
  }

  /**
   * Run PreToolUse hooks
   */
  async runPreToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolUseId: string,
    abortSignal: AbortSignal
  ): Promise<PreToolUseResult> {
    const matchers = this.config.PreToolUse ?? []
    const matchingHooks = this.getMatchingHooks(matchers, toolName)

    if (matchingHooks.length === 0) {
      return {
        allowed: true,
        decision: "allow",
        continue: true,
      }
    }

    const input: PreToolUseHookInput = {
      hook_event_name: "PreToolUse",
      session_id: this.sessionId,
      cwd: this.cwd,
      tool_name: toolName,
      tool_input: toolInput,
    }

    const context: HookContext = { signal: abortSignal }

    // Run all matching hooks and collect results
    let finalDecision: PermissionDecision = "allow"
    let finalReason: string | undefined
    let finalUpdatedInput: Record<string, unknown> | undefined
    let systemMessage: string | undefined
    let shouldContinue = true
    let stopReason: string | undefined

    for (const { hook, timeout } of matchingHooks) {
      try {
        const result = await this.runHookWithTimeout(
          hook,
          input,
          toolUseId,
          context,
          timeout
        )

        // Process result
        if (result.continue === false) {
          shouldContinue = false
          stopReason = result.stopReason
          break
        }

        if (result.systemMessage) {
          systemMessage = result.systemMessage
        }

        if (result.hookSpecificOutput) {
          const output = result.hookSpecificOutput
          if (output.hookEventName === "PreToolUse") {
            // Apply permission decision priority: deny > ask > allow
            if (output.permissionDecision === "deny") {
              finalDecision = "deny"
              finalReason = output.permissionDecisionReason
            } else if (output.permissionDecision === "ask" && finalDecision !== "deny") {
              finalDecision = "ask"
              finalReason = output.permissionDecisionReason
            } else if (output.permissionDecision === "allow" && output.updatedInput) {
              finalUpdatedInput = output.updatedInput
            }
          }
        }
      } catch (error) {
        // Log error but continue with other hooks
        console.error(`Hook error: ${error}`)
      }
    }

    return {
      allowed: finalDecision === "allow",
      decision: finalDecision,
      reason: finalReason,
      updatedInput: finalUpdatedInput,
      systemMessage,
      continue: shouldContinue,
      stopReason,
    }
  }

  /**
   * Run PostToolUse hooks
   */
  async runPostToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: unknown,
    toolUseId: string,
    abortSignal: AbortSignal
  ): Promise<PostToolUseResult> {
    const matchers = this.config.PostToolUse ?? []
    const matchingHooks = this.getMatchingHooks(matchers, toolName)

    if (matchingHooks.length === 0) {
      return { continue: true }
    }

    const input: PostToolUseHookInput = {
      hook_event_name: "PostToolUse",
      session_id: this.sessionId,
      cwd: this.cwd,
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
    }

    const context: HookContext = { signal: abortSignal }

    let additionalContext: string | undefined
    let systemMessage: string | undefined
    let shouldContinue = true
    let stopReason: string | undefined

    for (const { hook, timeout } of matchingHooks) {
      try {
        const result = await this.runHookWithTimeout(
          hook,
          input,
          toolUseId,
          context,
          timeout
        )

        if (result.continue === false) {
          shouldContinue = false
          stopReason = result.stopReason
          break
        }

        if (result.systemMessage) {
          systemMessage = result.systemMessage
        }

        if (result.hookSpecificOutput?.hookEventName === "PostToolUse") {
          if (result.hookSpecificOutput.additionalContext) {
            additionalContext = result.hookSpecificOutput.additionalContext
          }
        }
      } catch (error) {
        console.error(`Hook error: ${error}`)
      }
    }

    return {
      additionalContext,
      systemMessage,
      continue: shouldContinue,
      stopReason,
    }
  }

  /**
   * Run UserPromptSubmit hooks
   */
  async runUserPromptSubmit(
    prompt: string,
    abortSignal: AbortSignal
  ): Promise<{ additionalContext?: string; systemMessage?: string; continue: boolean; stopReason?: string }> {
    const matchers = this.config.UserPromptSubmit ?? []

    if (matchers.length === 0) {
      return { continue: true }
    }

    const input: HookInput = {
      hook_event_name: "UserPromptSubmit",
      session_id: this.sessionId,
      cwd: this.cwd,
      prompt,
    }

    const context: HookContext = { signal: abortSignal }

    let additionalContext: string | undefined
    let systemMessage: string | undefined
    let shouldContinue = true
    let stopReason: string | undefined

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        try {
          const result = await this.runHookWithTimeout(
            hook,
            input,
            null,
            context,
            matcher.timeout ?? 60
          )

          if (result.continue === false) {
            shouldContinue = false
            stopReason = result.stopReason
            break
          }

          if (result.systemMessage) {
            systemMessage = result.systemMessage
          }

          if (result.hookSpecificOutput?.hookEventName === "UserPromptSubmit") {
            if (result.hookSpecificOutput.additionalContext) {
              additionalContext = result.hookSpecificOutput.additionalContext
            }
          }
        } catch (error) {
          console.error(`Hook error: ${error}`)
        }
      }

      if (!shouldContinue) break
    }

    return {
      additionalContext,
      systemMessage,
      continue: shouldContinue,
      stopReason,
    }
  }

  /**
   * Run Stop hooks
   */
  async runStop(abortSignal: AbortSignal): Promise<void> {
    const matchers = this.config.Stop ?? []

    if (matchers.length === 0) {
      return
    }

    const input: HookInput = {
      hook_event_name: "Stop",
      session_id: this.sessionId,
      cwd: this.cwd,
      stop_hook_active: true,
    }

    const context: HookContext = { signal: abortSignal }

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        try {
          await this.runHookWithTimeout(
            hook,
            input,
            null,
            context,
            matcher.timeout ?? 60
          )
        } catch (error) {
          console.error(`Hook error: ${error}`)
        }
      }
    }
  }

  /**
   * Get hooks that match the given tool name
   */
  private getMatchingHooks(
    matchers: HookMatcher[],
    toolName: string
  ): Array<{ hook: HookCallback; timeout: number }> {
    const result: Array<{ hook: HookCallback; timeout: number }> = []

    for (const matcher of matchers) {
      // If no matcher pattern, match all
      if (!matcher.matcher) {
        for (const hook of matcher.hooks) {
          result.push({ hook, timeout: (matcher.timeout ?? 60) * 1000 })
        }
        continue
      }

      // Test regex pattern against tool name
      try {
        const regex = new RegExp(matcher.matcher)
        if (regex.test(toolName)) {
          for (const hook of matcher.hooks) {
            result.push({ hook, timeout: (matcher.timeout ?? 60) * 1000 })
          }
        }
      } catch {
        // Invalid regex, skip
        console.warn(`Invalid hook matcher regex: ${matcher.matcher}`)
      }
    }

    return result
  }

  /**
   * Run a hook with timeout
   */
  private async runHookWithTimeout(
    hook: HookCallback,
    input: HookInput,
    toolUseId: string | null,
    context: HookContext,
    timeoutMs: number
  ): Promise<HookOutput> {
    return new Promise<HookOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new HookTimeoutError(input.hook_event_name, timeoutMs))
      }, timeoutMs)

      hook(input, toolUseId, context)
        .then((result) => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }
}

/**
 * Create a HookMatcher helper
 */
export function createHookMatcher(
  hooks: HookCallback[],
  options?: { matcher?: string; timeout?: number }
): HookMatcher {
  return {
    hooks,
    matcher: options?.matcher,
    timeout: options?.timeout,
  }
}
