# @cognitive-swarm/tools-web-fetch

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/tools-web-fetch)](https://www.npmjs.com/package/@cognitive-swarm/tools-web-fetch)

HTTP fetch with redirect following, proxy support, and HTML content extraction. Can run as a standalone MCP tool server.

## Install

```bash
npm install @cognitive-swarm/tools-web-fetch
```

## Quick Start

```typescript
import { HttpClient, extractContent } from '@cognitive-swarm/tools-web-fetch'

const client = new HttpClient({
  timeoutMs: 15_000,
  maxBodyBytes: 2 * 1024 * 1024,
})

// Fetch a page
const result = await client.fetch('https://example.com')
console.log(result.status)  // 200
console.log(result.body)    // raw HTML

// Extract structured content
const content = extractContent(result.body)
console.log(content.title)      // "Example Domain"
console.log(content.wordCount)  // 42
console.log(content.links)      // [{ text: "More...", href: "https://..." }]
```

## HttpClient

Fetches URLs with automatic redirect following (up to 5 hops) and optional HTTP proxy support. Responses are capped at `maxBodyBytes` to prevent memory exhaustion.

### `fetch(targetUrl): Promise<FetchResult>`

```typescript
const result = await client.fetch('https://news.ycombinator.com')
console.log(result.url)          // final URL after redirects
console.log(result.status)       // HTTP status code
console.log(result.contentType)  // 'text/html; charset=utf-8'
console.log(result.body)         // response body as string
console.log(result.redirectedTo) // final URL if redirected
```

Non-2xx responses do NOT throw -- check `result.status` manually. Network errors, DNS failures, and timeouts throw.

### With proxy

```typescript
const client = new HttpClient({
  proxyUrl: 'http://proxy.corp.internal:8080',
  timeoutMs: 30_000,
})
```

## extractContent(html)

Extracts structured content from raw HTML. Removes `<script>`, `<style>`, `<nav>`, `<footer>`, and other non-content elements. Links capped at 50.

```typescript
const content = extractContent(html)
// { title, description, text, links, wordCount }
```

## MCP Tool Server

Run as a standalone MCP server for Claude Desktop or any MCP client:

```bash
npx cs-web-fetch
```

### MCP Configuration

```json
{
  "mcpServers": {
    "web-fetch": {
      "command": "npx",
      "args": ["cs-web-fetch"],
      "env": { "PROXY_URL": "http://proxy:8080" }
    }
  }
}
```

### Exposed Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `web_fetch` | `url: string` | Fetch a URL, return status + body |
| `web_extract` | `html: string` | Extract structured content from HTML |
| `web_fetch_and_extract` | `url: string` | Fetch + extract in one call |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PROXY_URL` | HTTP proxy URL |
| `TIMEOUT_MS` | Request timeout (default: 15000) |
| `MAX_BODY_BYTES` | Max body size (default: 2097152) |
| `USER_AGENT` | Custom User-Agent string |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxyUrl` | `string` | -- | HTTP proxy URL |
| `timeoutMs` | `number` | `15000` | Request timeout in ms |
| `maxBodyBytes` | `number` | `2097152` | Max response body (2 MB) |
| `userAgent` | `string` | `'cognitive-swarm/1.0 (tools-web-fetch)'` | User-Agent header |

## Types

```typescript
interface FetchResult {
  readonly url: string
  readonly status: number
  readonly contentType: string
  readonly body: string
  readonly redirectedTo?: string
}

interface ExtractedContent {
  readonly title: string
  readonly description: string
  readonly text: string
  readonly links: readonly ExtractedLink[]
  readonly wordCount: number
}
```

## Usage with Swarm Agents

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: [{
    config: {
      id: 'researcher',
      name: 'Web Researcher',
      role: 'Fetch and analyze web pages',
      personality: { curiosity: 0.9, caution: 0.4, conformity: 0.3, verbosity: 0.7 },
      listens: ['task:new', 'discovery'],
      canEmit: ['discovery', 'proposal'],
      tools: { mcpServers: ['web-fetch'] },
    },
    engine: { model: 'gpt-4o-mini' },
  }],
})
```

## Limits

- **Max redirects:** 5 hops
- **Max body size:** Configurable, default 2 MB (truncated silently)
- **Link extraction cap:** 50 links per page
- **Timeout:** Applies per HTTP request, not total redirect chain

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/tools-web-fetch) | [GitHub](https://github.com/medonomator/cognitive-swarm)
