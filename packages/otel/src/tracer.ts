import { trace } from '@opentelemetry/api'

const TRACER_NAME = '@cognitive-swarm/otel'
const TRACER_VERSION = '0.1.0'

/**
 * Returns the package tracer.
 * When no TracerProvider is registered, this returns a no-op tracer
 * with zero overhead - built into the OpenTelemetry API design.
 */
export function getTracer() {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION)
}
