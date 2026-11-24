import type { PeekRef } from '@/domain/peek'

// Peek refs the Calm system gallery points its rows at: real shapes, so a click opens the real panel in mock mode.
export const PEEK_SAMPLE_REFS = {
  metric: { type: 'metric', id: 'sleep.hours' },
  brief: { type: 'brief', id: 'health' },
} as const satisfies Record<string, PeekRef>
