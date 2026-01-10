/**
 * Hook type definitions for intercepting and controlling agent behavior
 * @module formagent-sdk/types/hooks
 */

import type { JSONSchema } from "./core"

// === Hook Event Names ===

/**
 * Available hook event types
 */
export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "Stop"
  | "SubagentStop"
  | "PreCompact"

// === Hook Input Types ===

/**
 * Common fields present in all hook inputs
 */
export interface HookInputBase {
  /** Hook event type */
  hook_event_name: HookEventName
  /** Current session ID */
  session_id: string
  /** Current working directory */
  cwd: string
}

/**
 * Input for PreToolUse hook (before tool execution)
 */
export interface PreToolUseHookInput extends HookInputBase {
  hook_event_name: "PreToolUse"
  /** Name of the tool being called */
  tool_name: string
  /** Input parameters passed to the tool */
  tool_input: Record<string, unknown>
}

/**
 * Input for PostToolUse hook (after tool execution)
 */
export interface PostToolUseHookInput extends HookInputBase {
  hook_event_name: "PostToolUse"
  /** Name of the tool that was called */
  tool_name: string
  /** Input parameters that were passed to the tool */
  tool_input: Record<string, unknown>
  /** Result returned by the tool */
  tool_response: unknown
}

/**
 * Input for UserPromptSubmit hook
 */
export interface UserPromptSubmitHookInput extends HookInputBase {
  hook_event_name: "UserPromptSubmit"
  /** User's prompt text */
  prompt: string
}

/**
 * Input for Stop hook
 */
export interface StopHookInput extends HookInputBase {
  hook_event_name: "Stop"
  /** Whether a stop hook is currently active */
  stop_hook_active: boolean
}

/**
 * Input for SubagentStop hook
 */
export interface SubagentStopHookInput extends HookInputBase {
  hook_event_name: "SubagentStop"
  /** Whether a stop hook is currently active */
  stop_hook_active: boolean
  /** Subagent identifier */
  agent_id?: string
}

/**
 * Input for PreCompact hook
 */
export interface PreCompactHookInput extends HookInputBase {
  hook_event_name: "PreCompact"
  /** What triggered the compaction */
  trigger: "manual" | "auto"
  /** Custom instructions for compaction */
  custom_instructions?: string
}

/**
 * Union type for all hook inputs
 */
export type HookInput =
  | PreToolUseHookInput
  | PostToolUseHookInput
  | UserPromptSubmitHookInput
  | StopHookInput
  | SubagentStopHookInput
  | PreCompactHookInput

// === Hook Output Types ===

/**
 * Permission decision for PreToolUse hook
 */
export type PermissionDecision = "allow" | "deny" | "ask"

/**
 * PreToolUse specific output
 */
export interface PreToolUseHookOutput {
  hookEventName: "PreToolUse"
  /** Permission decision for the tool */
  permissionDecision?: PermissionDecision
  /** Reason for the permission decision (shown to Claude) */
  permissionDecisionReason?: string
  /** Modified tool input (requires permissionDecision: 'allow') */
  updatedInput?: Record<string, unknown>
}

/**
 * PostToolUse specific output
 */
export interface PostToolUseHookOutput {
  hookEventName: "PostToolUse"
  /** Additional context to add to the conversation */
  additionalContext?: string
}

/**
 * UserPromptSubmit specific output
 */
export interface UserPromptSubmitHookOutput {
  hookEventName: "UserPromptSubmit"
  /** Additional context to add to the conversation */
  additionalContext?: string
}

/**
 * Stop specific output
 */
export interface StopHookOutput {
  hookEventName: "Stop"
}

/**
 * SubagentStop specific output
 */
export interface SubagentStopHookOutput {
  hookEventName: "SubagentStop"
}

/**
 * PreCompact specific output
 */
export interface PreCompactHookOutput {
  hookEventName: "PreCompact"
}

/**
 * Union type for hook-specific outputs
 */
export type HookSpecificOutput =
  | PreToolUseHookOutput
  | PostToolUseHookOutput
  | UserPromptSubmitHookOutput
  | StopHookOutput
  | SubagentStopHookOutput
  | PreCompactHookOutput

/**
 * Hook callback return type
 */
export interface HookOutput {
  /** Whether the agent should continue (default: true) */
  continue?: boolean
  /** Message to show when continue is false */
  stopReason?: string
  /** Hide stdout from logs */
  suppressOutput?: boolean
  /** System message to inject into conversation */
  systemMessage?: string
  /** Hook-specific output */
  hookSpecificOutput?: HookSpecificOutput
}

// === Hook Context ===

/**
 * Context passed to hook callbacks
 */
export interface HookContext {
  /** Abort signal for cancellation */
  signal: AbortSignal
}

// === Hook Callback ===

/**
 * Hook callback function signature
 */
export type HookCallback = (
  input: HookInput,
  toolUseId: string | null,
  context: HookContext
) => Promise<HookOutput>

// === Hook Matcher ===

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  /** Regex pattern to match tool names (optional, matches all if not specified) */
  matcher?: string
  /** Callback functions to execute */
  hooks: HookCallback[]
  /** Timeout in seconds (default: 60) */
  timeout?: number
}

// === Hooks Configuration ===

/**
 * Hooks configuration for session
 */
export interface HooksConfig {
  /** Pre-tool-use hooks (before tool execution) */
  PreToolUse?: HookMatcher[]
  /** Post-tool-use hooks (after tool execution) */
  PostToolUse?: HookMatcher[]
  /** User prompt submit hooks */
  UserPromptSubmit?: HookMatcher[]
  /** Stop hooks (when agent stops) */
  Stop?: HookMatcher[]
  /** Subagent stop hooks */
  SubagentStop?: HookMatcher[]
  /** Pre-compaction hooks */
  PreCompact?: HookMatcher[]
}

// === Structured Output Types ===

/**
 * Output format configuration for structured outputs
 */
export interface OutputFormat {
  /** Output type (currently only json_schema supported) */
  type: "json_schema"
  /** JSON Schema for the output structure */
  schema: JSONSchema
}

/**
 * Result event with structured output
 */
export interface StructuredResult {
  /** Result type */
  type: "result"
  /** Result subtype */
  subtype: "success" | "error_max_structured_output_retries"
  /** Validated structured output (only for success) */
  structured_output?: Record<string, unknown>
  /** Error message (only for error) */
  error?: string
}
