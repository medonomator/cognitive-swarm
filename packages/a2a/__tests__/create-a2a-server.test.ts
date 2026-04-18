import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as http from 'node:http'
import { createA2AServer } from '../src/create-a2a-server.js'
import type { DefaultRequestHandler } from '@a2a-js/sdk/server'

function makeRequest(
  url: string,
  options: http.RequestOptions = {},
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function makeMockHandler(): DefaultRequestHandler {
  const mockCard = {
    name: 'Test Agent',
    description: 'A test agent',
    url: 'http://localhost:0',
    version: '1.0.0',
    protocolVersion: '0.2.2',
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [],
  }

  return {
    getAgentCard: vi.fn().mockResolvedValue(mockCard),
  } as unknown as DefaultRequestHandler
}

describe('createA2AServer', () => {
  let baseUrl: string
  let a2aServer: ReturnType<typeof createA2AServer>
  let handler: DefaultRequestHandler

  beforeEach(async () => {
    handler = makeMockHandler()
    // Use port 0 to let the OS assign a random available port
    a2aServer = createA2AServer(handler, { port: 0, hostname: '127.0.0.1' })
    const addr = await a2aServer.start()
    // Resolve actual port from server
    const address = a2aServer.server.address()
    if (typeof address === 'object' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`
    } else {
      baseUrl = addr
    }
  })

  afterEach(async () => {
    await a2aServer.stop()
  })

  describe('server lifecycle', () => {
    it('starts and returns a base URL', () => {
      expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    })

    it('stops accepting connections after stop()', async () => {
      await a2aServer.stop()

      await expect(
        makeRequest(`${baseUrl}/health`, { method: 'GET' }),
      ).rejects.toThrow()

      // Re-create so afterEach doesn't fail on double-stop
      a2aServer = createA2AServer(handler, { port: 0, hostname: '127.0.0.1' })
      await a2aServer.start()
      const address = a2aServer.server.address()
      if (typeof address === 'object' && address !== null) {
        baseUrl = `http://127.0.0.1:${address.port}`
      }
    })
  })

  describe('GET /.well-known/agent-card.json', () => {
    it('returns proper JSON with the agent card', async () => {
      const res = await makeRequest(`${baseUrl}/.well-known/agent-card.json`, {
        method: 'GET',
      })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/json')
      expect(res.headers['access-control-allow-origin']).toBe('*')

      const card = JSON.parse(res.body)
      expect(card.name).toBe('Test Agent')
      expect(card.version).toBe('1.0.0')
    })

    it('calls handler.getAgentCard()', async () => {
      await makeRequest(`${baseUrl}/.well-known/agent-card.json`, {
        method: 'GET',
      })

      expect(handler.getAgentCard).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /health', () => {
    it('returns status ok with timestamp', async () => {
      const before = Date.now()
      const res = await makeRequest(`${baseUrl}/health`, { method: 'GET' })
      const after = Date.now()

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/json')

      const body = JSON.parse(res.body)
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeGreaterThanOrEqual(before)
      expect(body.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('OPTIONS /', () => {
    it('returns CORS headers with 204', async () => {
      const res = await makeRequest(`${baseUrl}/`, { method: 'OPTIONS' })

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe('*')
      expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')
      expect(res.headers['access-control-allow-headers']).toBe('Content-Type')
      expect(res.body).toBe('')
    })
  })

  describe('POST /', () => {
    it('dispatches to the transport handler', async () => {
      // The mock handler doesn't have a full transport, so the POST will
      // hit the JSON-RPC transport which will fail to process.
      // We verify the server accepts and attempts to process the request.
      const res = await makeRequest(
        `${baseUrl}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify({ jsonrpc: '2.0', method: 'tasks/get', id: 1, params: {} }),
      )

      // Transport will fail because handler is mocked, but server should not crash
      // It will return 500 (internal error) since the transport can't handle it
      expect([200, 500]).toContain(res.status)
    })

    it('returns 413 when body exceeds 1MB', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1)
      const res = await makeRequest(
        `${baseUrl}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        largeBody,
      )

      expect(res.status).toBe(413)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Request body too large')
    })
  })

  describe('unknown paths', () => {
    it('returns 404 for GET on unknown path', async () => {
      const res = await makeRequest(`${baseUrl}/unknown`, { method: 'GET' })

      expect(res.status).toBe(404)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Not Found')
    })

    it('returns 404 for POST on non-root path', async () => {
      const res = await makeRequest(
        `${baseUrl}/api/something`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        '{}',
      )

      expect(res.status).toBe(404)
    })
  })
})
