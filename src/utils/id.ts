/**
 * ID generation utilities
 * @module formagent-sdk/utils/id
 */

/**
 * Character set for URL-safe ID generation
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * Generate a unique, URL-safe identifier
 *
 * @param prefix - Optional prefix for the ID
 * @param length - Length of the random part (default: 12)
 * @returns A unique identifier string
 *
 * @example
 * ```ts
 * generateId() // "a1B2c3D4e5F6"
 * generateId("sess") // "sess_a1B2c3D4e5F6"
 * generateId("msg", 8) // "msg_a1B2c3D4"
 * ```
 */
export function generateId(prefix?: string, length: number = 12): string {
  const randomPart = generateRandomString(length)
  return prefix ? `${prefix}_${randomPart}` : randomPart
}

/**
 * Generate a random string of specified length
 * Uses crypto.getRandomValues for secure randomness
 *
 * @param length - Length of the string to generate
 * @returns A random alphanumeric string
 */
function generateRandomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  let result = ""
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length]
  }

  return result
}

/**
 * Generate a session ID
 *
 * @returns A unique session identifier with "sess" prefix
 *
 * @example
 * ```ts
 * generateSessionId() // "sess_a1B2c3D4e5F6"
 * ```
 */
export function generateSessionId(): string {
  return generateId("sess", 16)
}

/**
 * Generate a message ID
 *
 * @returns A unique message identifier with "msg" prefix
 *
 * @example
 * ```ts
 * generateMessageId() // "msg_a1B2c3D4e5F6g7H8"
 * ```
 */
export function generateMessageId(): string {
  return generateId("msg", 20)
}

/**
 * Generate a tool call ID
 *
 * @returns A unique tool call identifier with "toolu" prefix (Claude SDK compatible)
 *
 * @example
 * ```ts
 * generateToolCallId() // "toolu_01a1B2c3D4e5F6g7H8i9J0"
 * ```
 */
export function generateToolCallId(): string {
  return `toolu_01${generateRandomString(22)}`
}

/**
 * Generate a timestamp-based ID (for sorting)
 *
 * @param prefix - Optional prefix
 * @returns An ID with timestamp prefix for natural ordering
 *
 * @example
 * ```ts
 * generateTimestampId() // "1704067200000_a1B2c3D4"
 * generateTimestampId("evt") // "evt_1704067200000_a1B2c3D4"
 * ```
 */
export function generateTimestampId(prefix?: string): string {
  const timestamp = Date.now().toString(36)
  const random = generateRandomString(8)
  const base = `${timestamp}_${random}`
  return prefix ? `${prefix}_${base}` : base
}

/**
 * Validate if a string is a valid session ID
 *
 * @param id - ID to validate
 * @returns True if valid session ID format
 */
export function isValidSessionId(id: string): boolean {
  return /^sess_[A-Za-z0-9]{16}$/.test(id)
}

/**
 * Validate if a string is a valid message ID
 *
 * @param id - ID to validate
 * @returns True if valid message ID format
 */
export function isValidMessageId(id: string): boolean {
  return /^msg_[A-Za-z0-9]{20}$/.test(id)
}

/**
 * Validate if a string is a valid tool call ID
 *
 * @param id - ID to validate
 * @returns True if valid tool call ID format
 */
export function isValidToolCallId(id: string): boolean {
  return /^toolu_01[A-Za-z0-9]{22}$/.test(id)
}
