import type { RawEvent } from '@/core/types'

export function asObj(e: RawEvent): Record<string, unknown> {
  return e.body && typeof e.body === 'object' ? (e.body as Record<string, unknown>) : {}
}
