/**
 * WebFetch tool implementation
 * @module formagent-sdk/tools/builtin/webfetch
 */

import { lookup } from "node:dns/promises"

import type { ToolDefinition, ToolOutput, ToolContext } from "../../types/tool"
import type { WebFetchInput, BuiltinToolOptions } from "./types"

const MAX_CONTENT_LENGTH = 100000
const FETCH_TIMEOUT = 30000

function isIpV4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

function isIpV6(host: string): boolean {
  return /^[0-9a-fA-F:]+$/.test(host) && host.includes(":")
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast/reserved
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === "::" || normalized === "::1") return true
  if (normalized.startsWith("fe80:")) return true // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true // ULA fc00::/7
  return false
}

async function denyPrivateNetworkTargets(url: URL, options: BuiltinToolOptions): Promise<string | null> {
  if (options.allowPrivateNetwork) return null

  const hostname = url.hostname.toLowerCase()

  // Fast deny-list for local hostnames
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return `Blocked by policy (allowPrivateNetwork=false): hostname "${hostname}" is local-only`
  }

  // Block IP literals
  if (isIpV4(hostname) && isPrivateIpv4(hostname)) {
    return `Blocked by policy (allowPrivateNetwork=false): private IPv4 target "${hostname}"`
  }
  if (isIpV6(hostname) && isPrivateIpv6(hostname)) {
    return `Blocked by policy (allowPrivateNetwork=false): private IPv6 target "${hostname}"`
  }

  const resolveHostnames = options.resolveHostnames ?? true
  if (!resolveHostnames) return null

  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true })
    for (const addr of addrs) {
      if (addr.family === 4 && isPrivateIpv4(addr.address)) {
        return `Blocked by policy (allowPrivateNetwork=false): "${hostname}" resolves to private IPv4 "${addr.address}"`
      }
      if (addr.family === 6 && isPrivateIpv6(addr.address)) {
        return `Blocked by policy (allowPrivateNetwork=false): "${hostname}" resolves to private IPv6 "${addr.address}"`
      }
    }
  } catch (e) {
    return `DNS resolution failed for "${hostname}" (allowPrivateNetwork=false): ${e instanceof Error ? e.message : String(e)}`
  }

  return null
}

/**
 * Simple HTML to text converter
 */
function htmlToText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ")

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ")
  text = text.replace(/&amp;/g, "&")
  text = text.replace(/&lt;/g, "<")
  text = text.replace(/&gt;/g, ">")
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))

  // Clean up whitespace
  text = text.replace(/\s+/g, " ")
  text = text.trim()

  return text
}

/**
 * Simple HTML to Markdown converter
 */
function htmlToMarkdown(html: string): string {
  let md = html

  // Remove script and style
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

  // Convert headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n")
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "\n##### $1\n")
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "\n###### $1\n")

  // Convert paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n")

  // Convert links
  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")

  // Convert bold and italic
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, "**$2**")
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, "*$2*")

  // Convert code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, "\n```\n$1\n```\n")

  // Convert lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
  md = md.replace(/<\/?[ou]l[^>]*>/gi, "\n")

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n")

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, "")

  // Decode entities
  md = md.replace(/&nbsp;/g, " ")
  md = md.replace(/&amp;/g, "&")
  md = md.replace(/&lt;/g, "<")
  md = md.replace(/&gt;/g, ">")
  md = md.replace(/&quot;/g, '"')

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, "\n\n")
  md = md.trim()

  return md
}

/**
 * Create the WebFetch tool
 */
export function createWebFetchTool(options: BuiltinToolOptions = {}): ToolDefinition {
  return {
    name: "WebFetch",
    description: `Fetch content from a URL. Converts HTML to markdown for readability. Use for retrieving web pages, documentation, or API responses.`,
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch",
        },
        prompt: {
          type: "string",
          description: "Optional prompt to describe what information to extract",
        },
      },
      required: ["url"],
    },
    execute: async (rawInput: Record<string, unknown>, _context: ToolContext): Promise<ToolOutput> => {
      const input = rawInput as unknown as WebFetchInput
      const { url, prompt } = input

      // Validate URL
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return {
            content: `Invalid URL protocol: ${parsedUrl.protocol}. Only http/https are allowed.`,
            isError: true,
          }
        }
        // Upgrade HTTP to HTTPS
        if (parsedUrl.protocol === "http:") parsedUrl.protocol = "https:"
      } catch {
        return {
          content: `Invalid URL: ${url}`,
          isError: true,
        }
      }

      const ssrfDeny = await denyPrivateNetworkTargets(parsedUrl, options)
      if (ssrfDeny) {
        return { content: ssrfDeny, isError: true }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

        const response = await fetch(parsedUrl.toString(), {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; OpenCode-Agent/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        })

        clearTimeout(timeout)

        if (!response.ok) {
          return {
            content: `HTTP error: ${response.status} ${response.statusText}`,
            isError: true,
          }
        }

        // Check for redirect to different host
        const finalUrl = new URL(response.url)
        if (finalUrl.host !== parsedUrl.host) {
          return {
            content: `Redirected to different host: ${response.url}\n\nPlease fetch the new URL if you want to continue.`,
          }
        }

        const ssrfDenyAfter = await denyPrivateNetworkTargets(finalUrl, options)
        if (ssrfDenyAfter) {
          return { content: `Redirect target denied: ${ssrfDenyAfter}`, isError: true }
        }

        const contentType = response.headers.get("content-type") || ""
        let content = await response.text()

        // Truncate if too long
        if (content.length > MAX_CONTENT_LENGTH) {
          content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n... (content truncated)"
        }

        // Convert HTML to markdown
        if (contentType.includes("text/html")) {
          content = htmlToMarkdown(content)
        }

        // Build response
        let output = `URL: ${response.url}\n`
        output += `Content-Type: ${contentType}\n\n`

        if (prompt) {
          output += `Requested: ${prompt}\n\n`
        }

        output += content

        return {
          content: output,
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return {
            content: `Request timed out after ${FETCH_TIMEOUT}ms`,
            isError: true,
          }
        }
        return {
          content: `Failed to fetch: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * Default WebFetch tool instance
 */
export const WebFetchTool = createWebFetchTool()
