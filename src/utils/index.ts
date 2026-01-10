/**
 * Utility functions for formagent-sdk
 * @module formagent-sdk/utils
 */

// ID generation
export {
  generateId,
  generateSessionId,
  generateMessageId,
  generateToolCallId,
  generateTimestampId,
  isValidSessionId,
  isValidMessageId,
  isValidToolCallId,
} from "./id"

// Frontmatter parsing
export {
  parseFrontmatter,
  serializeFrontmatter,
  createWithFrontmatter,
  extractTitle,
  extractDescription,
} from "./frontmatter"
export type { FrontmatterResult } from "./frontmatter"

// Event emitter
export {
  TypedEventEmitter,
  createSessionEmitter,
  createAgentEmitter,
  waitForEvent,
  iterateEvents,
} from "./events"
export type { EventMap, SessionEventMap, AgentEventMap } from "./events"

// Environment utilities
export { loadEnvOverride, getProviderEnv } from "./env"
