/**
 * HTTP client with proxy support for fetching web pages.
 *
 * Proxy resolution order:
 *   1. Explicit `proxyUrl` in config
 *   2. HTTPS_PROXY / HTTP_PROXY env vars
 *   3. Direct connection (no proxy)
 */

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, ClientRequest } from 'node:http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { URL } from 'node:url'

// ── Public types ────────────────────────────────────────────────

export interface HttpClientConfig {
  /** Explicit proxy URL (e.g. http://proxy:8080, socks5://...) */
  readonly proxyUrl?: string
  /** Request timeout in ms */
  readonly timeoutMs?: number
  /** Max response body size in bytes (default 2MB) */
  readonly maxBodyBytes?: number
  /** Custom User-Agent header */
  readonly userAgent?: string
}

export interface FetchResult {
  readonly url: string
  readonly status: number
  readonly contentType: string
  readonly body: string
  readonly redirectedTo?: string
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BODY = 2 * 1024 * 1024 // 2MB
const DEFAULT_USER_AGENT = 'cognitive-swarm/0.1 (web-fetch)'
const MAX_REDIRECTS = 5

// ── Client ──────────────────────────────────────────────────────

export class HttpClient {
  private readonly proxyUrl: string | undefined
  private readonly timeoutMs: number
  private readonly maxBodyBytes: number
  private readonly userAgent: string

  constructor(config: HttpClientConfig = {}) {
    this.proxyUrl = config.proxyUrl
      ?? process.env['HTTPS_PROXY']
      ?? process.env['HTTP_PROXY']
      ?? process.env['https_proxy']
      ?? process.env['http_proxy']
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  }

  /**
   * Fetch a URL and return the response body as text.
   * Follows redirects (up to 5). Respects proxy settings.
   */
  async fetch(targetUrl: string): Promise<FetchResult> {
    let currentUrl = targetUrl
    let redirectCount = 0

    while (redirectCount < MAX_REDIRECTS) {
      const result = await this.singleRequest(currentUrl)

      // Follow redirects
      if (result.status >= 300 && result.status < 400 && result.redirectedTo) {
        currentUrl = new URL(result.redirectedTo, currentUrl).href
        redirectCount++
        continue
      }

      return {
        ...result,
        redirectedTo: currentUrl !== targetUrl ? currentUrl : undefined,
      }
    }

    throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${targetUrl}`)
  }

  private singleRequest(targetUrl: string): Promise<FetchResult> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl)
      const isHttps = parsed.protocol === 'https:'
      const reqFn = isHttps ? httpsRequest : httpRequest

      const agent = this.proxyUrl
        ? new HttpsProxyAgent(this.proxyUrl)
        : undefined

      const req: ClientRequest = reqFn(
        targetUrl,
        {
          method: 'GET',
          agent,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'identity',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: this.timeoutMs,
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0
          const contentType = res.headers['content-type'] ?? ''
          const location = res.headers['location']

          // For redirects, don't read body
          if (status >= 300 && status < 400 && location) {
            res.resume() // drain
            resolve({
              url: targetUrl,
              status,
              contentType,
              body: '',
              redirectedTo: location,
            })
            return
          }

          const chunks: Buffer[] = []
          let totalBytes = 0

          res.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length
            if (totalBytes > this.maxBodyBytes) {
              res.destroy()
              reject(new Error(`Response body exceeds ${this.maxBodyBytes} bytes`))
              return
            }
            chunks.push(chunk)
          })

          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            resolve({ url: targetUrl, status, contentType, body })
          })

          res.on('error', reject)
        },
      )

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`Request timeout after ${this.timeoutMs}ms: ${targetUrl}`))
      })
      req.end()
    })
  }
}
