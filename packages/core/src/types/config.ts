import type { ErrorHandler } from '@cognitive-engine/core'

/** User-facing SignalBus config. */
export interface SignalBusConfig {
  readonly maxHistorySize?: number
  readonly defaultTtlMs?: number
  readonly enableConflictDetection?: boolean
  readonly sweepIntervalMs?: number
  readonly onError?: ErrorHandler
}

/** Resolved SignalBus config - all fields required. */
export interface ResolvedSignalBusConfig {
  readonly maxHistorySize: number
  readonly defaultTtlMs: number
  readonly enableConflictDetection: boolean
  readonly sweepIntervalMs: number
  readonly onError: ErrorHandler
}
