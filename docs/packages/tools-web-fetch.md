# @cognitive-swarm/tools-web-fetch

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/tools-web-fetch)](https://www.npmjs.com/package/@cognitive-swarm/tools-web-fetch)

HTTP fetch with redirect following, proxy support, and HTML content extraction. Can run as a standalone MCP tool server for integration with Claude, agents, or any MCP-compatible client.

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
console.log(result.status)    // 200
console.log(result.body)      // raw HTML string

// Extract structured content from HTML
const content = extractContent(result.body)
console.log(content.title)      // "Example Domain"
console.log(content.wordCount)  // 42
console.log(content.links)      // [{ text: "More information...", href: "https://..." }]
```

## HttpClient

The `HttpClient` class fetches URLs with automatic redirect following (up to 5 hops) and optional HTTP proxy support. Responses are capped at `maxBodyBytes` to prevent memory exhaustion when fetching large pages.

### Constructor

```typescript
const client = new HttpClient(config?: HttpClientConfig)
```

### Methods

#### `fetch(targetUrl: string): Promise<FetchResult>`

Fetches the given URL. Follows redirects automatically (HTTP 301, 302, 303, 307, 308) up to a maximum of 5 hops. If a proxy is configured, all requests are tunneled through it.

```typescript
const result = await client.fetch('https://news.ycombinator.com')

console.log(result.url)          // final URL after redirects
console.log(result.status)       // HTTP status code
console.log(result.contentType)  // 'text/html; charset=utf-8'
console.log(result.body)         // response body as string
console.log(result.redirectedTo) // final URL if redirected, undefined otherwise
```

**Redirect handling:**

```typescript
// Short URL that redirects
const result = await client.fetch('https://bit.ly/abc123')
console.log(result.redirectedTo) // 'https://example.com/full-article'
console.log(result.url)          // 'https://example.com/full-article'
```

**Error handling:**

```typescript
try {
  const result = await client.fetch('https://unreachable.invalid')
} catch (error) {
  // Throws on network errors, DNS failures, timeouts
  console.error(error.message)
}

// Non-2xx responses do NOT throw -- check status manually
const result = await client.fetch('https://example.com/missing')
if (result.status === 404) {
  console.log('Page not found')
}
```

**With proxy:**

```typescript
const client = new HttpClient({
  proxyUrl: 'http://proxy.corp.internal:8080',
  timeoutMs: 30_000,
})

const result = await client.fetch('https://api.example.com/data')
```

## extractContent(html)

Extracts structured content from raw HTML. Removes `<script>`, `<style>`, `<nav>`, `<footer>`, and other non-content elements before extraction. Links are capped at 50 to keep output manageable.

```typescript
import { extractContent } from '@cognitive-swarm/tools-web-fetch'

const html = `
<html>
  <head><title>My Page</title>
    <meta name="description" content="A sample page">
  </head>
  <body>
    <nav><a href="/home">Home</a></nav>
    <main>
      <h1>Article Title</h1>
      <p>This is the main content of the article.</p>
      <a href="https://example.com">Example Link</a>
    </main>
    <footer>Copyright 2026</footer>
    <script>console.log('removed')</script>
  </body>
</html>
`

const content = extractContent(html)
```

**Result:**

```typescript
{
  title: 'My Page',
  description: 'A sample page',
  text: 'Article Title\nThis is the main content of the article.\nExample Link',
  links: [
    { text: 'Example Link', href: 'https://example.com' }
  ],
  wordCount: 10
}
```

::: tip
`<nav>` and `<footer>` content is stripped before text extraction -- this means navigation links and footer boilerplate won't pollute the extracted text or link list.
:::

## Types

### HttpClientConfig

Configuration for the `HttpClient` constructor.

```typescript
interface HttpClientConfig {
  /** HTTP proxy URL. All requests will be tunneled through this proxy. */
  readonly proxyUrl?: string

  /** Request timeout in milliseconds. Default: 15000 (15 seconds). */
  readonly timeoutMs?: number

  /** Maximum response body size in bytes. Larger responses are truncated.
   *  Default: 2097152 (2 MB). */
  readonly maxBodyBytes?: number

  /** Custom User-Agent header string.
   *  Default: 'cognitive-swarm/1.0 (tools-web-fetch)' */
  readonly userAgent?: string
}
```

### FetchResult

Returned by `HttpClient.fetch()`.

```typescript
interface FetchResult {
  /** The final URL (after any redirects). */
  readonly url: string

  /** HTTP status code. */
  readonly status: number

  /** Content-Type header value. */
  readonly contentType: string

  /** Response body as a UTF-8 string. Truncated at maxBodyBytes. */
  readonly body: string

  /** If the request was redirected, contains the final URL.
   *  Undefined when no redirects occurred. */
  readonly redirectedTo?: string
}
```

### ExtractedContent

Returned by `extractContent()`.

```typescript
interface ExtractedContent {
  /** Page title from <title> tag, or empty string. */
  readonly title: string

  /** Meta description from <meta name="description">, or empty string. */
  readonly description: string

  /** Cleaned text content with scripts, styles, nav, and footer removed. */
  readonly text: string

  /** Links extracted from <a> tags. Capped at 50 entries. */
  readonly links: readonly ExtractedLink[]

  /** Approximate word count of the extracted text. */
  readonly wordCount: number
}
```

### ExtractedLink

Individual link extracted from HTML.

```typescript
interface ExtractedLink {
  /** Link text (inner text of the <a> tag). */
  readonly text: string

  /** Link target (href attribute). */
  readonly href: string
}
```

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxyUrl` | `string` | `undefined` | HTTP proxy URL for tunneling requests |
| `timeoutMs` | `number` | `15000` | Request timeout in milliseconds |
| `maxBodyBytes` | `number` | `2097152` | Max response body size (2 MB) |
| `userAgent` | `string` | `'cognitive-swarm/1.0 (tools-web-fetch)'` | Custom User-Agent header |

## MCP Tool Server

The package can run as a standalone MCP tool server, exposing `fetch` and `extractContent` as tools that MCP-compatible clients (Claude Desktop, agents, etc.) can invoke.

### CLI

```bash
# Run as MCP server (stdio transport)
npx cs-web-fetch
```

### MCP Configuration

Add to your Claude Desktop or MCP client config:

```json
{
  "mcpServers": {
    "web-fetch": {
      "command": "npx",
      "args": ["cs-web-fetch"],
      "env": {
        "PROXY_URL": "http://proxy:8080"
      }
    }
  }
}
```

### Exposed Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `web_fetch` | `url: string` | Fetch a URL, return status, body, content type |
| `web_extract` | `html: string` | Extract structured content from raw HTML |
| `web_fetch_and_extract` | `url: string` | Fetch + extract in one call |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PROXY_URL` | HTTP proxy URL |
| `TIMEOUT_MS` | Request timeout (default: 15000) |
| `MAX_BODY_BYTES` | Max body size (default: 2097152) |
| `USER_AGENT` | Custom User-Agent string |

## Usage Patterns

### Fetching and Extracting in One Pipeline

```typescript
import { HttpClient, extractContent } from '@cognitive-swarm/tools-web-fetch'

async function summarizePage(url: string) {
  const client = new HttpClient({ timeoutMs: 10_000 })
  const result = await client.fetch(url)

  if (result.status !== 200) {
    throw new Error(`HTTP ${result.status} for ${url}`)
  }

  const content = extractContent(result.body)
  return {
    title: content.title,
    text: content.text.slice(0, 2000),  // first 2000 chars
    linkCount: content.links.length,
    wordCount: content.wordCount,
  }
}
```

### Batch Fetching with Error Handling

```typescript
import { HttpClient, extractContent, type FetchResult } from '@cognitive-swarm/tools-web-fetch'

async function batchFetch(urls: string[]) {
  const client = new HttpClient({ timeoutMs: 20_000 })

  const results = await Promise.allSettled(
    urls.map(url => client.fetch(url))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<FetchResult> => r.status === 'fulfilled')
    .map(r => ({
      url: r.value.url,
      content: extractContent(r.value.body),
    }))
}
```

### Using with Swarm Agents

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: [
    {
      config: {
        id: 'researcher',
        name: 'Web Researcher',
        role: 'Fetch and analyze web pages for the team',
        personality: { curiosity: 0.9, caution: 0.4, conformity: 0.3, verbosity: 0.7 },
        listens: ['task:new', 'discovery'],
        canEmit: ['discovery', 'proposal'],
        tools: {
          mcpServers: ['web-fetch'],
        },
      },
      engine: { model: 'gpt-4o-mini' },
    },
  ],
})
```

## Limits

- **Max redirects:** 5 hops. Throws after the 5th redirect.
- **Max body size:** Configurable, default 2 MB. Response is truncated silently.
- **Link extraction cap:** 50 links maximum per page.
- **Timeout:** Applies to each individual HTTP request, not the total redirect chain.
