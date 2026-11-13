// Kept apart from connector-market (a client module) so server components can read the table: a value imported
// from a client module is a reference there, not the object.

export type ConnectorStatus = 'ok' | 'error' | 'setup' | 'off' | 'waiting' | 'ready'

export const STATUS: Record<ConnectorStatus, { label: string; color: string }> = {
  ok: { label: 'Connected', color: 'var(--good)' },
  error: { label: 'Sync failing', color: 'var(--bad)' },
  setup: { label: 'Key missing', color: 'var(--warn)' },
  off: { label: 'Not connected', color: 'var(--ink-3)' },
  waiting: { label: 'Almost there', color: 'var(--warn)' },
  ready: { label: 'Ready, not in use', color: 'var(--pill)' },
}
