#!/usr/bin/env node

/**
 * Web Search MCP Server — exposes Brave Search API as MCP tools.
 *
 * Tools:
 *   - web_search:  general web search, returns organic results + news
 *   - web_news:    news-focused search, returns only news results
 *
 * Proxy support:
 *   HTTPS_PROXY / HTTP_PROXY env vars (auto-detected), or BRAVE_PROXY_URL explicitly.
 *
 * Usage (stdio):
 *   BRAVE_API_KEY=xxx npx cs-web-search
 *   BRAVE_API_KEY=xxx HTTPS_PROXY=http://proxy:8080 npx cs-web-search
 *
 * Usage from cognitive-swarm agent config:
 *   { name: 'web-search', transport: { type: 'stdio', command: 'npx', args: ['cs-web-search'] } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { BraveClient } from './brave-client.js'

// ── Configuration ───────────────────────────────────────────────

const apiKey = process.env['BRAVE_API_KEY']
if (!apiKey) {
  process.stderr.write('BRAVE_API_KEY environment variable is required\n')
  process.exit(1)
}

const client = new BraveClient({
  apiKey,
  timeoutMs: Number(process.env['BRAVE_TIMEOUT_MS'] ?? 10_000),
  proxyUrl: process.env['BRAVE_PROXY_URL'],
})

// ── MCP Server ──────────────────────────────────────────────────

const server = new McpServer(
  { name: 'web-search', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// ── Tool: web_search ────────────────────────────────────────────

server.tool(
  'web_search',
  'Search the web using Brave Search. Returns organic results and news.',
  {
    query: z.string().describe('Search query'),
    count: z.number().min(1).max(20).default(10).describe('Number of results (1-20)'),
    offset: z.number().min(0).default(0).describe('Pagination offset'),
  },
  async ({ query, count, offset }) => {
    const response = await client.search(query, count, offset)

    const lines: string[] = []

    if (response.results.length > 0) {
      lines.push(`## Web Results (${response.results.length})`)
      for (const r of response.results) {
        lines.push(`### ${r.title}`)
        lines.push(r.url)
        lines.push(r.description)
        if (r.age) lines.push(`_${r.age}_`)
        lines.push('')
      }
    }

    if (response.news.length > 0) {
      lines.push(`## News (${response.news.length})`)
      for (const n of response.news) {
        lines.push(`### ${n.title}`)
        lines.push(`${n.url} (${n.source})`)
        lines.push(n.description)
        if (n.age) lines.push(`_${n.age}_`)
        lines.push('')
      }
    }

    if (lines.length === 0) {
      lines.push('No results found.')
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ── Tool: web_news ──────────────────────────────────────────────

server.tool(
  'web_news',
  'Search for recent news using Brave Search. Returns news articles only.',
  {
    query: z.string().describe('News search query'),
    count: z.number().min(1).max(20).default(10).describe('Number of results (1-20)'),
  },
  async ({ query, count }) => {
    const response = await client.search(query, count, 0)

    const lines: string[] = []

    if (response.news.length > 0) {
      for (const n of response.news) {
        lines.push(`### ${n.title}`)
        lines.push(`${n.url} (${n.source})`)
        lines.push(n.description)
        if (n.age) lines.push(`_${n.age}_`)
        lines.push('')
      }
    }

    // Fall back to web results if no dedicated news
    if (response.news.length === 0 && response.results.length > 0) {
      lines.push('_No dedicated news results. Showing web results:_')
      lines.push('')
      for (const r of response.results) {
        lines.push(`### ${r.title}`)
        lines.push(r.url)
        lines.push(r.description)
        if (r.age) lines.push(`_${r.age}_`)
        lines.push('')
      }
    }

    if (lines.length === 0) {
      lines.push('No news found.')
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ── Start ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  const proxyInfo = process.env['BRAVE_PROXY_URL']
    ?? process.env['HTTPS_PROXY']
    ?? process.env['HTTP_PROXY']
  process.stderr.write(
    `web-search MCP server running on stdio${proxyInfo ? ` (proxy: ${proxyInfo})` : ''}\n`,
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
