import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { BraveClient } from '../src/brave-client.js'

// Mock node:https — intercept request() calls
vi.mock('node:https', () => ({
  request: vi.fn(),
}))

vi.mock('node:http', () => ({
  request: vi.fn(),
}))

import { request as httpsRequest } from 'node:https'

function mockHttpsResponse(body: unknown, status = 200): void {
  const json = JSON.stringify(body)
  const mockRes = new Readable({ read() { this.push(json); this.push(null) } })
  Object.assign(mockRes, { statusCode: status, headers: {} })

  vi.mocked(httpsRequest).mockImplementation((_url, _opts, cb) => {
    const callback = cb as (res: Readable) => void
    process.nextTick(() => callback(mockRes))
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void }
    req.end = vi.fn()
    req.destroy = vi.fn()
    return req as ReturnType<typeof httpsRequest>
  })
}

describe('BraveClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Prevent env proxy from interfering
    delete process.env['HTTPS_PROXY']
    delete process.env['HTTP_PROXY']
    delete process.env['https_proxy']
    delete process.env['http_proxy']
  })

  it('parses web results correctly', async () => {
    mockHttpsResponse({
      query: { original: 'typescript swarm' },
      web: {
        results: [
          { title: 'Result 1', url: 'https://example.com', description: 'Desc 1', age: '2h' },
          { title: 'Result 2', url: 'https://example.org', description: 'Desc 2' },
        ],
      },
      news: { results: [] },
      mixed: { main: [{ index: 0 }, { index: 1 }] },
    })

    const client = new BraveClient({ apiKey: 'test-key' })
    const result = await client.search('typescript swarm', 5)

    expect(httpsRequest).toHaveBeenCalledOnce()
    const url = String(vi.mocked(httpsRequest).mock.calls[0]![0])
    expect(url).toContain('q=typescript+swarm')
    expect(url).toContain('count=5')

    expect(result.query).toBe('typescript swarm')
    expect(result.results).toHaveLength(2)
    expect(result.results[0]!.title).toBe('Result 1')
    expect(result.results[0]!.age).toBe('2h')
    expect(result.results[1]!.age).toBeUndefined()
    expect(result.news).toHaveLength(0)
    expect(result.totalResults).toBe(2)
  })

  it('parses news results with source', async () => {
    mockHttpsResponse({
      query: { original: 'ai news' },
      web: { results: [] },
      news: {
        results: [
          {
            title: 'AI Breakthrough',
            url: 'https://news.com/article',
            description: 'Big news',
            age: '1h',
            meta_url: { hostname: 'news.com' },
          },
        ],
      },
    })

    const client = new BraveClient({ apiKey: 'test-key' })
    const result = await client.search('ai news')

    expect(result.news).toHaveLength(1)
    expect(result.news[0]!.source).toBe('news.com')
    expect(result.news[0]!.title).toBe('AI Breakthrough')
  })

  it('handles API errors', async () => {
    mockHttpsResponse('Rate limited', 429)

    const client = new BraveClient({ apiKey: 'test-key' })
    await expect(client.search('test')).rejects.toThrow('Brave API 429')
  })

  it('clamps count to 20', async () => {
    mockHttpsResponse({ web: { results: [] } })

    const client = new BraveClient({ apiKey: 'test-key' })
    await client.search('test', 50)

    const url = String(vi.mocked(httpsRequest).mock.calls[0]![0])
    expect(url).toContain('count=20')
  })

  it('handles missing fields gracefully', async () => {
    mockHttpsResponse({})

    const client = new BraveClient({ apiKey: 'test-key' })
    const result = await client.search('empty')

    expect(result.results).toHaveLength(0)
    expect(result.news).toHaveLength(0)
    expect(result.query).toBe('empty')
  })
})
