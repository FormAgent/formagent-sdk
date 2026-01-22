/**
 * Retry utility for API requests with exponential backoff
 * @module formagent-sdk/utils/retry
 */

/**
 * Error that can be parsed from API response
 */
interface APIError {
  error?: {
    type?: string
    message?: string
    code?: string
  }
}

/**
 * Retry configuration
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number
  /** Maximum delay between retries in milliseconds (default: 30000) */
  maxDelay?: number
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /** Whether to jitter the delay (default: true) */
  jitter?: boolean
  /** Callback called before each retry */
  onRetry?: (attempt: number, error: Error) => void
  /** Abort signal to cancel retries */
  signal?: AbortSignal
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  onRetry: () => {},
  signal: undefined as unknown as AbortSignal,
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Exponential backoff
  const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay)

  // Add jitter to avoid thundering herd
  if (jitter) {
    return delay * (0.5 + Math.random() * 0.5)
  }

  return delay
}

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  // Retry on server errors (5xx) and rate limiting (429)
  return status >= 500 || status === 429
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors (e.g., ECONNREFUSED, ETIMEDOUT)
    return (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("ECONNRESET")
    )
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    // Check for rate limit or usage limit errors
    // Note: usage_limit may resolve after waiting (multi-key rotation, quota reset, etc.)
    if (message.includes("rate_limit") || message.includes("rate limit")) {
      return true
    }

    // Usage limit - retry for multi-key rotation scenarios
    if (message.includes("usage_limit") || message.includes("usage limit")) {
      return true
    }

    // Check for timeout errors
    if (message.includes("timeout") || message.includes("timed out")) {
      return true
    }

    // Check for server error indicators
    if (message.includes("5") || message.includes("502") || message.includes("503") || message.includes("504")) {
      return true
    }
  }

  return false
}

/**
 * Extract status code from error message
 */
function extractStatusCode(error: Error): number | null {
  const match = error.message.match(/(\d{3})/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    // Check if aborted
    if (opts.signal?.aborted) {
      throw new Error("Request aborted")
    }

    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on the last attempt
      if (attempt >= opts.maxAttempts - 1) {
        throw lastError
      }

      // Check if error is retryable
      const statusCode = extractStatusCode(lastError)
      const isRetryable =
        statusCode !== null
          ? isRetryableStatus(statusCode)
          : isRetryableError(lastError)

      if (!isRetryable) {
        throw lastError
      }

      // Calculate delay and wait
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitter
      )

      opts.onRetry(attempt + 1, lastError)
      await sleep(delay)
    }
  }

  throw (
    lastError || new Error("Max retries exceeded")
  )
}

/**
 * Retry a fetch request with exponential backoff
 *
 * @param url - URL to fetch
 * @param init - Fetch init options
 * @param retryOptions - Retry configuration
 * @returns Fetch response
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  retryOptions?: RetryOptions
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, init)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        let errorMessage = `HTTP ${response.status}`

        try {
          const errorJson = JSON.parse(errorText) as APIError
          if (errorJson.error?.type) {
            errorMessage += `: ${errorJson.error.type}`
          }
          if (errorJson.error?.message) {
            errorMessage += ` - ${errorJson.error.message}`
          }
        } catch {
          // Not JSON, use raw text
          if (errorText) {
            errorMessage += ` ${errorText}`
          }
        }

        const error = new Error(errorMessage)
        ;(error as any).status = response.status
        ;(error as any).responseText = errorText
        throw error
      }

      return response
    },
    {
      signal: init.signal,
      ...retryOptions,
    }
  )
}

/**
 * Parse retry options from environment variables
 */
export function getRetryOptionsFromEnv(): RetryOptions {
  return {
    maxAttempts: Number.parseInt(process.env.FORMAGENT_RETRY_MAX_ATTEMPTS || "3", 10),
    initialDelay: Number.parseInt(process.env.FORMAGENT_RETRY_INITIAL_DELAY || "1000", 10),
    maxDelay: Number.parseInt(process.env.FORMAGENT_RETRY_MAX_DELAY || "30000", 10),
  }
}
