/**
 * HttpRequest tool implementation
 * General-purpose HTTP client for API calls
 * @module formagent-sdk/tools/builtin/httprequest
 */

import { lookup } from "node:dns/promises"

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { HttpRequestInput, HttpMethod, BuiltinToolOptions } from "./types"

const DEFAULT_TIMEOUT = 30000
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Check if an IP is private/local
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number)
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
  }

  // IPv6 private ranges
  const normalized = ip.toLowerCase()
  if (normalized === "::" || normalized === "::1") return true
  if (normalized.startsWith("fe80:")) return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true

  return false
}

/**
 * Validate URL and check for SSRF
 */
async function validateUrl(
  url: string,
  options: BuiltinToolOptions
): Promise<{ valid: true; parsedUrl: URL } | { valid: false; error: string }> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { valid: false, error: `Invalid URL: ${url}` }
  }

  // Only allow http/https
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { valid: false, error: `Invalid protocol: ${parsedUrl.protocol}. Only http/https allowed.` }
  }

  // Check for private network unless explicitly allowed
  if (!options.allowPrivateNetwork) {
    const hostname = parsedUrl.hostname.toLowerCase()

    // Block local hostnames
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      return { valid: false, error: `Blocked: localhost/local hostnames not allowed` }
    }

    // Check IP literals
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && isPrivateIp(hostname)) {
      return { valid: false, error: `Blocked: private IP address ${hostname}` }
    }

    // Resolve hostname and check IP
    const resolveHostnames = options.resolveHostnames ?? true
    if (resolveHostnames) {
      try {
        const addrs = await lookup(hostname, { all: true, verbatim: true })
        for (const addr of addrs) {
          if (isPrivateIp(addr.address)) {
            return { valid: false, error: `Blocked: ${hostname} resolves to private IP ${addr.address}` }
          }
        }
      } catch (e) {
        return { valid: false, error: `DNS resolution failed for ${hostname}` }
      }
    }
  }

  return { valid: true, parsedUrl }
}

const HTTPREQUEST_DESCRIPTION = `Make HTTP requests to APIs and web services.

Use this tool when you need to:
- Call REST APIs (GET, POST, PUT, DELETE, etc.)
- Send data to web services
- Fetch JSON data from APIs
- Interact with webhooks

Parameters:
- method: HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- url: Full URL to request (required)
- headers: Request headers as key-value pairs (optional)
- body: Request body for POST/PUT/PATCH (optional, auto-serialized to JSON)
- timeout: Request timeout in ms (default: 30000, max: 120000)
- responseType: Expected response type - 'json', 'text', or 'binary' (default: auto-detect)

Security:
- Private/local network access is blocked by default
- Maximum response size: 5MB

Best practices:
- Include appropriate Content-Type header for POST/PUT requests
- Handle authentication via headers (Authorization, API keys, etc.)
- Use responseType: 'json' when expecting JSON response

Example:
{
  "method": "POST",
  "url": "https://api.example.com/data",
  "headers": {
    "Authorization": "Bearer token123",
    "Content-Type": "application/json"
  },
  "body": { "name": "test", "value": 42 }
}`

/**
 * Create the HttpRequest tool
 */
export function createHttpRequestTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "HttpRequest",
    description: HTTPREQUEST_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
          description: "HTTP method",
        },
        url: {
          type: "string",
          description: "URL to request",
        },
        headers: {
          type: "object",
          description: "Request headers",
          additionalProperties: { type: "string" },
        },
        body: {
          description: "Request body (auto-serialized to JSON if object)",
        },
        timeout: {
          type: "number",
          description: "Request timeout in milliseconds (default: 30000, max: 120000)",
        },
        responseType: {
          type: "string",
          enum: ["json", "text", "binary"],
          description: "Expected response type (default: auto-detect)",
        },
      },
      required: ["method", "url"],
    },
    execute: async (rawInput: Record<string, unknown>, context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as HttpRequestInput
      const { method, url, headers = {}, body, timeout, responseType } = input

      // Validate method
      const validMethods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
      if (!validMethods.includes(method)) {
        return {
          content: `Invalid HTTP method: ${method}. Must be one of: ${validMethods.join(", ")}`,
          isError: true,
        }
      }

      // Validate URL
      const urlValidation = await validateUrl(url, options)
      if (!urlValidation.valid) {
        return {
          content: urlValidation.error,
          isError: true,
        }
      }

      // Prepare request options
      const requestTimeout = Math.min(timeout ?? DEFAULT_TIMEOUT, 120000)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout)

      // Combine abort signals
      const signal = context.abortSignal
        ? AbortSignal.any([controller.signal, context.abortSignal])
        : controller.signal

      // Prepare headers
      const requestHeaders: Record<string, string> = {
        "User-Agent": "FormAgent-SDK/1.0",
        ...headers,
      }

      // Prepare body
      let requestBody: string | undefined
      if (body !== undefined && ["POST", "PUT", "PATCH"].includes(method)) {
        if (typeof body === "string") {
          requestBody = body
        } else {
          requestBody = JSON.stringify(body)
          // Set Content-Type if not already set
          if (!requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
            requestHeaders["Content-Type"] = "application/json"
          }
        }
      }

      try {
        const response = await fetch(urlValidation.parsedUrl.toString(), {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal,
        })

        clearTimeout(timeoutId)

        // Check response size
        const contentLength = response.headers.get("content-length")
        if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
          return {
            content: `Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE})`,
            isError: true,
          }
        }

        // Get response body
        const contentType = response.headers.get("content-type") || ""
        let responseBody: unknown
        let responseText: string

        // Determine how to parse response
        const effectiveResponseType =
          responseType ||
          (contentType.includes("application/json") ? "json" : "text")

        if (effectiveResponseType === "json") {
          try {
            responseBody = await response.json()
            responseText = JSON.stringify(responseBody, null, 2)
          } catch {
            responseText = await response.text()
            responseBody = responseText
          }
        } else if (effectiveResponseType === "binary") {
          const buffer = await response.arrayBuffer()
          responseText = `[Binary data: ${buffer.byteLength} bytes]`
          responseBody = { type: "binary", size: buffer.byteLength }
        } else {
          responseText = await response.text()
          responseBody = responseText
        }

        // Truncate large responses
        if (responseText.length > 100000) {
          responseText = responseText.slice(0, 100000) + "\n\n... (truncated)"
        }

        // Format output
        const statusEmoji = response.ok ? "✓" : "✗"
        const output = `${statusEmoji} ${method} ${url}
Status: ${response.status} ${response.statusText}
Content-Type: ${contentType}

Response:
${responseText}`

        return {
          content: output,
          isError: !response.ok,
          metadata: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers as unknown as Iterable<[string, string]>),
            body: responseBody,
          },
        }
      } catch (error) {
        clearTimeout(timeoutId)

        if (error instanceof Error) {
          if (error.name === "AbortError") {
            return {
              content: `Request timed out after ${requestTimeout}ms`,
              isError: true,
            }
          }
          return {
            content: `Request failed: ${error.message}`,
            isError: true,
          }
        }

        return {
          content: `Request failed: ${String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default HttpRequest tool instance
 */
export const HttpRequestTool = createHttpRequestTool()
