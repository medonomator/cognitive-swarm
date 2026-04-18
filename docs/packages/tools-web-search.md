# @cognitive-swarm/tools-web-search

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/tools-web-search)](https://www.npmjs.com/package/@cognitive-swarm/tools-web-search)

Brave Search API wrapper with web and news search, proxy support, and MCP tool server mode. Provides a typed, minimal client for integrating web search into swarm agents or standalone applications.

## Install

```bash
npm install @cognitive-swarm/tools-web-search
```

## Quick Start

```typescript
import { BraveClient } from '@cognitive-swarm/tools-web-search'

const client = new BraveClient({
  apiKey: process.env.BRAVE_API_KEY!,
})

const response = await client.search('cognitive swarm intelligence', 10)

for (const result of response.results) {
  console.log(`${result.title} — ${result.url}`)
  console.log(`  ${result.description}`)
  if (result.age) console.log(`  Published: ${result.age}`)
}

console.log(`Total results: ${response.totalResults}`)
```

## BraveClient

The `BraveClient` class wraps the Brave Search API, combining web results and news results into a single typed response. Supports pagination via `offset`, proxy tunneling, and configurable timeouts.

### Constructor

```typescript
const client = new BraveClient(config: BraveClientConfig)
```

### Methods

#### `search(query: string, count?: number, offset?: number): Promise<BraveSearchResponse>`

Performs a web search using the Brave Search API. Returns both web results and news results in a single response.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | required | Search query string |
| `count` | `number` | `10` | Number of results to return (max 20) |
| `offset` | `number` | `0` | Pagination offset for result pages |

```typescript
// Basic search
const response = await client.search('TypeScript generics')

// With count and pagination
const page1 = await client.search('TypeScript generics', 10, 0)
const page2 = await client.search('TypeScript generics', 10, 10)
```

**Web results:**

```typescript
const response = await client.search('rust async runtime')

for (const result of response.results) {
  console.log(result.title)        // 'Tokio - An asynchronous Rust runtime'
  console.log(result.url)          // 'https://tokio.rs'
  console.log(result.description)  // 'Tokio is an event-driven...'
  console.log(result.age)          // '2 days ago' (optional)
}
```

**News results:**

```typescript
const response = await client.search('AI regulation 2026')

for (const news of response.news) {
  console.log(news.title)       // 'EU Passes Comprehensive AI Act...'
  console.log(news.url)         // 'https://reuters.com/...'
  console.log(news.description) // 'The European Union...'
  console.log(news.source)      // 'Reuters'
  console.log(news.age)         // '3 hours ago'
}
```

**Error handling:**

```typescript
try {
  const response = await client.search('test query')
} catch (error) {
  // Throws on:
  // - Network errors / DNS failures
  // - Timeout (configurable via timeoutMs)
  // - API errors (invalid key, rate limit, etc.)
  console.error('Search failed:', error.message)
}
```

## Types

### BraveClientConfig

Configuration for the `BraveClient` constructor.

```typescript
interface BraveClientConfig {
  /** Brave Search API key. Required.
   *  Obtain from https://brave.com/search/api/ */
  readonly apiKey: string

  /** Brave Search API base URL.
   *  Default: 'https://api.search.brave.com/res/v1' */
  readonly baseUrl?: string

  /** Request timeout in milliseconds.
   *  Default: 10000 (10 seconds). */
  readonly timeoutMs?: number

  /** HTTP proxy URL. Requests will be tunneled through this proxy. */
  readonly proxyUrl?: string
}
```

### BraveSearchResponse

Returned by `BraveClient.search()`.

```typescript
interface BraveSearchResponse {
  /** The original search query. */
  readonly query: string

  /** Web search results. */
  readonly results: readonly BraveWebResult[]

  /** News search results. May be empty if no news matches. */
  readonly news: readonly BraveNewsResult[]

  /** Estimated total number of results available. */
  readonly totalResults: number
}
```

### BraveWebResult

A single web search result.

```typescript
interface BraveWebResult {
  /** Page title. */
  readonly title: string

  /** Page URL. */
  readonly url: string

  /** Result description / snippet. */
  readonly description: string

  /** Relative age of the result (e.g. '2 days ago').
   *  May be undefined for timeless content. */
  readonly age?: string
}
```

### BraveNewsResult

A single news search result.

```typescript
interface BraveNewsResult {
  /** Article headline. */
  readonly title: string

  /** Article URL. */
  readonly url: string

  /** Article summary / snippet. */
  readonly description: string

  /** Relative age of the article (e.g. '3 hours ago'). */
  readonly age?: string

  /** News source name (e.g. 'Reuters', 'TechCrunch'). */
  readonly source: string
}
```

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | **required** | Brave Search API key |
| `baseUrl` | `string` | `'https://api.search.brave.com/res/v1'` | API base URL |
| `timeoutMs` | `number` | `10000` | Request timeout in milliseconds |
| `proxyUrl` | `string` | `undefined` | HTTP proxy URL for tunneling |

## MCP Tool Server

The package can run as a standalone MCP tool server, exposing web search as a tool for MCP-compatible clients.

### CLI

```bash
# Run as MCP server (stdio transport)
BRAVE_API_KEY=your-key npx cs-web-search
```

### MCP Configuration

Add to your Claude Desktop or MCP client config:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "npx",
      "args": ["cs-web-search"],
      "env": {
        "BRAVE_API_KEY": "your-brave-api-key"
      }
    }
  }
}
```

### Exposed Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `web_search` | `query: string, count?: number, offset?: number` | Search the web via Brave Search API |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | **Yes** | Brave Search API key |
| `BRAVE_BASE_URL` | No | Custom API base URL |
| `TIMEOUT_MS` | No | Request timeout (default: 10000) |
| `PROXY_URL` | No | HTTP proxy URL |

## Usage Patterns

### Research Pipeline

```typescript
import { BraveClient } from '@cognitive-swarm/tools-web-search'
import { HttpClient, extractContent } from '@cognitive-swarm/tools-web-fetch'

async function research(topic: string) {
  const search = new BraveClient({ apiKey: process.env.BRAVE_API_KEY! })
  const http = new HttpClient({ timeoutMs: 15_000 })

  // Step 1: Search for relevant pages
  const response = await search.search(topic, 5)

  // Step 2: Fetch and extract content from top results
  const pages = await Promise.allSettled(
    response.results.map(async (result) => {
      const fetched = await http.fetch(result.url)
      const content = extractContent(fetched.body)
      return {
        title: result.title,
        url: result.url,
        text: content.text.slice(0, 3000),
        wordCount: content.wordCount,
      }
    })
  )

  return pages
    .filter((p): p is PromiseFulfilledResult<any> => p.status === 'fulfilled')
    .map(p => p.value)
}
```

### Paginated Search

```typescript
import { BraveClient, type BraveWebResult } from '@cognitive-swarm/tools-web-search'

async function searchAll(query: string, maxResults: number = 50) {
  const client = new BraveClient({ apiKey: process.env.BRAVE_API_KEY! })
  const allResults: BraveWebResult[] = []

  for (let offset = 0; offset < maxResults; offset += 20) {
    const count = Math.min(20, maxResults - offset)
    const response = await client.search(query, count, offset)
    allResults.push(...response.results)

    if (response.results.length < count) break  // no more results
  }

  return allResults
}
```

### News Monitoring

```typescript
import { BraveClient } from '@cognitive-swarm/tools-web-search'

async function checkNews(topics: string[]) {
  const client = new BraveClient({ apiKey: process.env.BRAVE_API_KEY! })

  const newsItems = await Promise.all(
    topics.map(async (topic) => {
      const response = await client.search(topic, 5)
      return response.news.map(item => ({
        topic,
        title: item.title,
        source: item.source,
        url: item.url,
        age: item.age,
      }))
    })
  )

  return newsItems.flat()
}
```

### Using with Swarm Agents

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: [
    {
      config: {
        id: 'searcher',
        name: 'Web Searcher',
        role: 'Search the web for current information on any topic',
        personality: { curiosity: 0.95, caution: 0.3, conformity: 0.2, verbosity: 0.6 },
        listens: ['task:new'],
        canEmit: ['discovery', 'proposal'],
        tools: {
          mcpServers: ['web-search'],
        },
      },
      engine: { model: 'gpt-4o-mini' },
    },
  ],
})
```

## Rate Limits

Brave Search API has rate limits depending on your plan:

| Plan | Requests/second | Requests/month |
|------|----------------|----------------|
| Free | 1 | 2,000 |
| Base | 5 | 20,000 |
| Pro | 15 | 100,000 |

The client does not perform automatic rate limiting -- implement your own throttling if needed for high-volume use cases.
