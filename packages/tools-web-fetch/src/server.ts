#!/usr/bin/env node

/**
 * Web Fetch & Scrape MCP Server — read URLs and extract structured content.
 *
 * Tools:
 *   - web_fetch:   fetch raw page content from a URL
 *   - web_scrape:  fetch + extract structured content (title, text, links)
 *
 * Proxy support:
 *   - HTTPS_PROXY / HTTP_PROXY env vars (auto-detected)
 *   - Or explicit proxy_url parameter per request
 *
 * Usage (stdio):
 *   npx cs-web-fetch
 *   HTTPS_PROXY=http://proxy:8080 npx cs-web-fetch
 *
 * Usage from cognitive-swarm agent config:
 *   { name: 'web-fetch', transport: { type: 'stdio', command: 'npx', args: ['cs-web-fetch'] } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { HttpClient } from './http-client.js'
import { extractContent } from './html-extractor.js'

// ── Default client (uses env proxy if set) ──────────────────────

const defaultClient = new HttpClient()

// ── MCP Server ──────────────────────────────────────────────────

const server = new McpServer(
  { name: 'web-fetch', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// ── Tool: web_fetch ─────────────────────────────────────────────

server.tool(
  'web_fetch',
  'Fetch raw content from a URL. Returns the full page body as text. Supports proxy.',
  {
    url: z.string().url().describe('URL to fetch'),
    proxy_url: z.string().optional().describe('Optional proxy URL (e.g. http://proxy:8080, socks5://host:1080)'),
    max_bytes: z.number().min(1024).max(10_485_760).default(2_097_152).describe('Max response size in bytes (default 2MB, max 10MB)'),
    timeout_ms: z.number().min(1000).max(60_000).default(15_000).describe('Request timeout in ms'),
  },
  async ({ url, proxy_url, max_bytes, timeout_ms }) => {
    const client = proxy_url
      ? new HttpClient({ proxyUrl: proxy_url, maxBodyBytes: max_bytes, timeoutMs: timeout_ms })
      : max_bytes !== 2_097_152 || timeout_ms !== 15_000
        ? new HttpClient({ maxBodyBytes: max_bytes, timeoutMs: timeout_ms })
        : defaultClient

    const result = await client.fetch(url)

    const lines: string[] = [
      `URL: ${result.url}`,
      `Status: ${result.status}`,
      `Content-Type: ${result.contentType}`,
    ]
    if (result.redirectedTo) {
      lines.push(`Redirected to: ${result.redirectedTo}`)
    }
    lines.push(`Size: ${result.body.length} bytes`)
    lines.push('')
    lines.push(result.body)

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ── Tool: web_scrape ────────────────────────────────────────────

server.tool(
  'web_scrape',
  'Fetch a URL and extract structured content: title, description, clean text, and links. Strips HTML, scripts, styles. Supports proxy.',
  {
    url: z.string().url().describe('URL to scrape'),
    proxy_url: z.string().optional().describe('Optional proxy URL (e.g. http://proxy:8080, socks5://host:1080)'),
    include_links: z.boolean().default(false).describe('Include extracted links in output'),
    max_text_length: z.number().min(100).max(100_000).default(50_000).describe('Max text length in characters'),
    timeout_ms: z.number().min(1000).max(60_000).default(15_000).describe('Request timeout in ms'),
  },
  async ({ url, proxy_url, include_links, max_text_length, timeout_ms }) => {
    const client = proxy_url
      ? new HttpClient({ proxyUrl: proxy_url, timeoutMs: timeout_ms })
      : timeout_ms !== 15_000
        ? new HttpClient({ timeoutMs: timeout_ms })
        : defaultClient

    const result = await client.fetch(url)

    if (result.status >= 400) {
      return {
        content: [{ type: 'text', text: `Error: HTTP ${result.status} for ${url}` }],
        isError: true,
      }
    }

    const extracted = extractContent(result.body)

    const lines: string[] = []

    if (extracted.title) {
      lines.push(`# ${extracted.title}`)
      lines.push('')
    }

    if (extracted.description) {
      lines.push(`> ${extracted.description}`)
      lines.push('')
    }

    lines.push(`URL: ${result.redirectedTo ?? url}`)
    lines.push(`Words: ${extracted.wordCount}`)
    lines.push('')

    const text = extracted.text.length > max_text_length
      ? extracted.text.slice(0, max_text_length) + '\n\n[truncated]'
      : extracted.text

    lines.push(text)

    if (include_links && extracted.links.length > 0) {
      lines.push('')
      lines.push(`## Links (${extracted.links.length})`)
      for (const link of extracted.links) {
        lines.push(`- [${link.text}](${link.href})`)
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ── Start ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const proxyInfo = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY']
  process.stderr.write(
    `web-fetch MCP server running on stdio${proxyInfo ? ` (proxy: ${proxyInfo})` : ''}\n`,
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
