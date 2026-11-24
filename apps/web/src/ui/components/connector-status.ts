// Kept apart from connector-market (a client module) so server components can read the table: a value imported
// from a client module is a reference there, not the object.

import type { Status, StatusTone } from '@/domain/status-of'

export type ConnectorStatus = 'ok' | 'error' | 'setup' | 'off' | 'waiting' | 'ready'

export const STATUS: Record<ConnectorStatus, { label: string; color: string }> = {
  ok: { label: 'Connected', color: 'var(--good)' },
  error: { label: 'Sync failing', color: 'var(--bad)' },
  setup: { label: 'Key missing', color: 'var(--warn)' },
  off: { label: 'Not connected', color: 'var(--ink-3)' },
  waiting: { label: 'Almost there', color: 'var(--warn)' },
  ready: { label: 'Ready, not in use', color: 'var(--pill)' },
}

/** The word a source's health gets (`StatusWord`): a working one is Steady, a failing one Slipping; the rest keep their own label in a tone. */
export const STATUS_WORD: Record<ConnectorStatus, { status?: Status; tone?: StatusTone }> = {
  ok: { status: 'Steady' }, error: { status: 'Slipping' }, setup: { tone: 'warn' }, waiting: { tone: 'warn' }, off: { tone: 'quiet' }, ready: { tone: 'quiet' },
}
