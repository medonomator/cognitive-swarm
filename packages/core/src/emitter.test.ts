import { describe, it, expect, vi } from 'vitest'
import { TypedEventEmitter } from './emitter.js'

interface TestEventMap {
  ping: { value: number }
  pong: string
}

function createEmitter(
  onError?: (error: unknown, context: string) => void,
): TypedEventEmitter<TestEventMap> {
  return new TypedEventEmitter<TestEventMap>(onError)
}

describe('TypedEventEmitter', () => {
  it('delivers events to registered handlers', () => {
    const emitter = createEmitter()
    const handler = vi.fn()

    emitter.on('ping', handler)
    emitter.emit('ping', { value: 42 })

    expect(handler).toHaveBeenCalledWith({ value: 42 })
  })

  it('delivers events to multiple handlers', () => {
    const emitter = createEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('ping', h2)
    emitter.emit('ping', { value: 1 })

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('does not deliver events to unregistered handlers', () => {
    const emitter = createEmitter()
    const handler = vi.fn()

    emitter.on('ping', handler)
    emitter.off('ping', handler)
    emitter.emit('ping', { value: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not cross-deliver between event types', () => {
    const emitter = createEmitter()
    const pingHandler = vi.fn()
    const pongHandler = vi.fn()

    emitter.on('ping', pingHandler)
    emitter.on('pong', pongHandler)
    emitter.emit('ping', { value: 1 })

    expect(pingHandler).toHaveBeenCalledOnce()
    expect(pongHandler).not.toHaveBeenCalled()
  })

  it('catches handler errors without breaking other handlers', () => {
    const onError = vi.fn()
    const emitter = createEmitter(onError)

    const badHandler = vi.fn(() => {
      throw new Error('boom')
    })
    const goodHandler = vi.fn()

    emitter.on('ping', badHandler)
    emitter.on('ping', goodHandler)
    emitter.emit('ping', { value: 1 })

    expect(badHandler).toHaveBeenCalled()
    expect(goodHandler).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      'event.ping',
    )
  })

  it('removes all listeners for a specific event', () => {
    const emitter = createEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('pong', h2)
    emitter.removeAllListeners('ping')
    emitter.emit('ping', { value: 1 })
    emitter.emit('pong', 'hello')

    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('removes all listeners when no event specified', () => {
    const emitter = createEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('pong', h2)
    emitter.removeAllListeners()
    emitter.emit('ping', { value: 1 })
    emitter.emit('pong', 'hello')

    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('reports listener count', () => {
    const emitter = createEmitter()
    expect(emitter.listenerCount('ping')).toBe(0)

    const handler = vi.fn()
    emitter.on('ping', handler)
    expect(emitter.listenerCount('ping')).toBe(1)

    emitter.off('ping', handler)
    expect(emitter.listenerCount('ping')).toBe(0)
  })

  it('handles emit with no listeners gracefully', () => {
    const emitter = createEmitter()
    expect(() => emitter.emit('ping', { value: 1 })).not.toThrow()
  })

  it('handles off for non-existent handler gracefully', () => {
    const emitter = createEmitter()
    const handler = vi.fn()
    expect(() => emitter.off('ping', handler)).not.toThrow()
  })
})
