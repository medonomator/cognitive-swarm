import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { JsonRpcTransportHandler } from '@a2a-js/sdk/server'
import type { DefaultRequestHandler } from '@a2a-js/sdk/server'
import type { JSONRPCResponse } from '@a2a-js/sdk'
import type { A2AServerOptions } from './types.js'

/** Maximum request body size in bytes (1 MB). */
const MAX_BODY_SIZE = 1024 * 1024

/** Timeout for graceful shutdown in milliseconds. */
const SHUTDOWN_TIMEOUT_MS = 5_000

export interface A2AServer {
  /** The underlying Node.js HTTP server. */
  readonly server: Server
  /** Start listening. Returns the base URL. */
  start(): Promise<string>
  /** Gracefully shut down, closing all active connections with a timeout. */
  stop(): Promise<void>
}

/**
 * Creates a standalone Node.js HTTP server for the A2A handler.
 * No Express or other framework needed.
 *
 * Endpoints:
 * - `GET /.well-known/agent-card.json` - Agent Card
 * - `POST /` - JSON-RPC dispatch (tasks/send, tasks/sendSubscribe, etc.)
 */
export function createA2AServer(
  handler: DefaultRequestHandler,
  options?: A2AServerOptions,
): A2AServer {
  const port = options?.port ?? 3000
  const hostname = options?.hostname ?? '0.0.0.0'

  const transport = new JsonRpcTransportHandler(handler)

  // Track active connections for graceful shutdown
  const connections = new Set<import('node:net').Socket>()

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, handler, transport)
    } catch (error: unknown) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        }))
      }
    }
  })

  server.on('connection', (socket) => {
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
  })

  return {
    server,
    start() {
      return new Promise((resolve) => {
        server.listen(port, hostname, () => {
          const addr = `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`
          resolve(addr)
        })
      })
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        // Stop accepting new connections
        server.close((err) => (err ? reject(err) : resolve()))

        // Force-close remaining connections after timeout
        const timer = setTimeout(() => {
          for (const socket of connections) {
            socket.destroy()
          }
        }, SHUTDOWN_TIMEOUT_MS)
        timer.unref()
      })
    },
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handler: DefaultRequestHandler,
  transport: JsonRpcTransportHandler,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  // Agent Card endpoint
  if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
    const card = await handler.getAgentCard()
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify(card))
    return
  }

  // Health check endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
    return
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // JSON-RPC endpoint
  if (req.method === 'POST' && url.pathname === '/') {
    const body = await readBody(req, MAX_BODY_SIZE)
    if (body === null) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Request body too large' }))
      return
    }
    const parsed: unknown = JSON.parse(body)
    const result = await transport.handle(parsed)

    if (isAsyncGenerator(result)) {
      // SSE streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      for await (const event of result) {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
      res.end()
    } else {
      // Regular JSON-RPC response
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify(result))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
}

/**
 * Reads the request body up to `maxBytes`.
 * Returns `null` if the body exceeds the limit.
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let exceeded = false

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
        exceeded = true
        // Resume the stream to drain remaining data so the response can be sent
        req.resume()
        return
      }
      if (!exceeded) {
        chunks.push(chunk)
      }
    })
    req.on('end', () => resolve(exceeded ? null : Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function isAsyncGenerator(
  value: JSONRPCResponse | AsyncGenerator<JSONRPCResponse>,
): value is AsyncGenerator<JSONRPCResponse> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  )
}
