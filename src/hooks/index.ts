/**
 * Hooks module for intercepting and controlling agent behavior
 * @module formagent-sdk/hooks
 */

export { HooksManager, createHookMatcher, HookTimeoutError } from "./manager"
export type { PreToolUseResult, PostToolUseResult } from "./manager"

// Re-export types
export type {
  HooksConfig,
  HookCallback,
  HookMatcher,
  HookInput,
  HookOutput,
  HookContext,
  HookEventName,
  PreToolUseHookInput,
  PostToolUseHookInput,
  UserPromptSubmitHookInput,
  StopHookInput,
  SubagentStopHookInput,
  PreCompactHookInput,
  PreToolUseHookOutput,
  PostToolUseHookOutput,
  UserPromptSubmitHookOutput,
  StopHookOutput,
  SubagentStopHookOutput,
  PreCompactHookOutput,
  HookSpecificOutput,
  PermissionDecision,
} from "../types/hooks"
