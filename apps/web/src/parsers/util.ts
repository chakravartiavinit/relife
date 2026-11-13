import type { RawEvent } from '@/core/types'

export function asObj(e: RawEvent): Record<string, unknown> {
  return e.body && typeof e.body === 'object' ? (e.body as Record<string, unknown>) : {}
}

/**
 * One raw event per day and source (the one-summary-per-day connectors). A later sync with different numbers
 * replaces the body and queues the day again (`emitRawMany`), so a day that goes A to B to A ends on A.
 */
export const dayEventId = (date: string) => `day:${date}`
export const isDayEvent = (e: { externalId: string }) => e.externalId.startsWith('day:')
