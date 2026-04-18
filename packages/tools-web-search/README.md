# @cognitive-swarm/tools-web-search

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/tools-web-search)](https://www.npmjs.com/package/@cognitive-swarm/tools-web-search)

Brave Search API wrapper with web and news search, proxy support, and MCP tool server mode.

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
  console.log(`${result.title} -- ${result.url}`)
  console.log(`  ${result.description}`)
}

// News results included automatically
for (const news of response.news) {
  console.log(`[${news.source}] ${news.title} (${news.age})`)
}
```

## BraveClient

Wraps the Brave Search API, combining web results and news results into a single typed response. Supports pagination via `offset`, proxy tunneling, and configurable timeouts.

### `search(query, count?, offset?): Promise<BraveSearchResponse>`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | required | Search query |
| `count` | `number` | `10` | Results to return (max 20) |
| `offset` | `number` | `0` | Pagination offset |

```typescript
const page1 = await client.search('TypeScript generics', 10, 0)
const page2 = await client.search('TypeScript generics', 10, 10)
```

Throws on network errors, DNS failures, timeouts, and API errors (invalid key, rate limit).

## MCP Tool Server

Run as a standalone MCP server for Claude Desktop or any MCP client:

```bash
BRAVE_API_KEY=your-key npx cs-web-search
```

### MCP Configuration

```json
{
  "mcpServers": {
    "web-search": {
      "command": "npx",
      "args": ["cs-web-search"],
      "env": { "BRAVE_API_KEY": "your-brave-api-key" }
    }
  }
}
```

### Exposed Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `web_search` | `query, count?, offset?` | Search the web via Brave Search API |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | Yes | Brave Search API key |
| `BRAVE_BASE_URL` | No | Custom API base URL |
| `TIMEOUT_MS` | No | Request timeout (default: 10000) |
| `PROXY_URL` | No | HTTP proxy URL |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Brave Search API key |
| `baseUrl` | `string` | `'https://api.search.brave.com/res/v1'` | API base URL |
| `timeoutMs` | `number` | `10000` | Request timeout in ms |
| `proxyUrl` | `string` | -- | HTTP proxy URL |

## Types

```typescript
interface BraveSearchResponse {
  readonly query: string
  readonly results: readonly BraveWebResult[]
  readonly news: readonly BraveNewsResult[]
  readonly totalResults: number
}

interface BraveWebResult {
  readonly title: string
  readonly url: string
  readonly description: string
  readonly age?: string
}

interface BraveNewsResult {
  readonly title: string
  readonly url: string
  readonly description: string
  readonly age?: string
  readonly source: string
}
```

## Usage Patterns

### Research pipeline with tools-web-fetch

```typescript
import { BraveClient } from '@cognitive-swarm/tools-web-search'
import { HttpClient, extractContent } from '@cognitive-swarm/tools-web-fetch'

async function research(topic: string) {
  const search = new BraveClient({ apiKey: process.env.BRAVE_API_KEY! })
  const http = new HttpClient({ timeoutMs: 15_000 })

  const response = await search.search(topic, 5)

  const pages = await Promise.allSettled(
    response.results.map(async (result) => {
      const fetched = await http.fetch(result.url)
      const content = extractContent(fetched.body)
      return { title: result.title, url: result.url, text: content.text.slice(0, 3000) }
    })
  )

  return pages
    .filter((p): p is PromiseFulfilledResult<any> => p.status === 'fulfilled')
    .map(p => p.value)
}
```

### Using with swarm agents

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: [{
    config: {
      id: 'searcher',
      name: 'Web Searcher',
      role: 'Search the web for current information',
      personality: { curiosity: 0.95, caution: 0.3, conformity: 0.2, verbosity: 0.6 },
      listens: ['task:new'],
      canEmit: ['discovery', 'proposal'],
      tools: { mcpServers: ['web-search'] },
    },
    engine: { model: 'gpt-4o-mini' },
  }],
})
```

## Rate Limits

| Plan | Requests/sec | Requests/month |
|------|-------------|----------------|
| Free | 1 | 2,000 |
| Base | 5 | 20,000 |
| Pro | 15 | 100,000 |

The client does not perform automatic rate limiting.

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/tools-web-search) | [GitHub](https://github.com/medonomator/cognitive-swarm)
