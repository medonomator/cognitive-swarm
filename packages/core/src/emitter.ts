import type { ErrorHandler } from '@cognitive-engine/core'
import { defaultErrorHandler } from '@cognitive-engine/core'

type EventHandler<T> = (data: T) => void

/**
 * Generic typed event emitter.
 * Reusable across swarm packages - parameterized by an event map interface.
 * Follows the CognitiveEventEmitter pattern from cognitive-engine.
 */
export class TypedEventEmitter<
  TMap extends { [K in keyof TMap]: unknown },
> {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>()
  private readonly onError: ErrorHandler

  constructor(onError?: ErrorHandler) {
    this.onError = onError ?? defaultErrorHandler
  }

  on<K extends keyof TMap & string>(
    event: K,
    handler: EventHandler<TMap[K]>,
  ): void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as EventHandler<unknown>)
  }

  off<K extends keyof TMap & string>(
    event: K,
    handler: EventHandler<TMap[K]>,
  ): void {
    this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
  }

  emit<K extends keyof TMap & string>(
    event: K,
    data: TMap[K],
  ): void {
    const set = this.handlers.get(event)
    if (set) {
      for (const handler of set) {
        try {
          handler(data)
        } catch (error: unknown) {
          this.onError(error, `event.${event}`)
        }
      }
    }
  }

  removeAllListeners(event?: keyof TMap & string): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }

  listenerCount(event: keyof TMap & string): number {
    return this.handlers.get(event)?.size ?? 0
  }
}
