/**
 * Brave Search API client — thin typed wrapper.
 *
 * Supports web search and news search with optional proxy.
 * Proxy resolution: explicit config → HTTPS_PROXY → HTTP_PROXY → direct.
 */

import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { HttpsProxyAgent } from 'https-proxy-agent'

// ── Public types ────────────────────────────────────────────────

export interface BraveWebResult {
  readonly title: string
  readonly url: string
  readonly description: string
  readonly age?: string
}

export interface BraveNewsResult {
  readonly title: string
  readonly url: string
  readonly description: string
  readonly age?: string
  readonly source: string
}

export interface BraveSearchResponse {
  readonly query: string
  readonly results: readonly BraveWebResult[]
  readonly news: readonly BraveNewsResult[]
  readonly totalResults: number
}

export interface BraveClientConfig {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
  /** Proxy URL (e.g. http://proxy:8080). Falls back to HTTPS_PROXY / HTTP_PROXY env. */
  readonly proxyUrl?: string
}

// ── Raw API shapes (internal) ───────────────────────────────────

interface RawWebResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

interface RawNewsResult {
  title?: string
  url?: string
  description?: string
  age?: string
  meta_url?: { hostname?: string }
}

interface RawApiResponse {
  query?: { original?: string }
  web?: { results?: readonly RawWebResult[] }
  news?: { results?: readonly RawNewsResult[] }
  mixed?: { main?: readonly { index?: number }[] }
}

// ── Client ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.search.brave.com/res/v1'
const DEFAULT_TIMEOUT_MS = 10_000

export class BraveClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly proxyUrl: string | undefined

  constructor(config: BraveClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.proxyUrl = config.proxyUrl
      ?? process.env['HTTPS_PROXY']
      ?? process.env['HTTP_PROXY']
      ?? process.env['https_proxy']
      ?? process.env['http_proxy']
  }

  /**
   * Web search — returns organic results + news if available.
   */
  async search(query: string, count = 10, offset = 0): Promise<BraveSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
      offset: String(offset),
      text_decorations: 'false',
    })

    const raw = await this.request<RawApiResponse>(`/web/search?${params.toString()}`)

    const results: BraveWebResult[] = (raw.web?.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? '',
      age: r.age,
    }))

    const news: BraveNewsResult[] = (raw.news?.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? '',
      age: r.age,
      source: r.meta_url?.hostname ?? 'unknown',
    }))

    return {
      query: raw.query?.original ?? query,
      results,
      news,
      totalResults: raw.mixed?.main?.length ?? results.length,
    }
  }

  // ── Internal ────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const reqFn = isHttps ? httpsRequest : httpRequest
    const agent = this.proxyUrl ? new HttpsProxyAgent(this.proxyUrl) : undefined

    return new Promise((resolve, reject) => {
      const req = reqFn(
        url,
        {
          method: 'GET',
          agent,
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'identity',
            'X-Subscription-Token': this.apiKey,
          },
          timeout: this.timeoutMs,
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0
          const chunks: Buffer[] = []

          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            if (status < 200 || status >= 300) {
              reject(new Error(`Brave API ${status}: ${body.slice(0, 200)}`))
              return
            }
            try {
              resolve(JSON.parse(body) as T)
            } catch {
              reject(new Error(`Brave API: invalid JSON response`))
            }
          })
          res.on('error', reject)
        },
      )

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`Brave API timeout after ${this.timeoutMs}ms`))
      })
      req.end()
    })
  }
}
