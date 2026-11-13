// Peek: the drawer (desktop) or sheet (phone) that opens on `?peek=<type>:<id>`. Pure helpers, no React.
// Ids: metric:<tracker slug> (dots allowed), routine:<scheduleId>, goal:<goalId>, txn:<transactionId>,
// merchant:<name>, insight:<id>, connector:<connectorId>, person:<id>, quest:<id> or quest:weekly.<key>,
// sync:status, brief:<scope>.

export const PEEK_TYPES = ['metric', 'routine', 'goal', 'txn', 'merchant', 'insight', 'connector', 'person', 'quest', 'sync', 'brief'] as const
export type PeekType = (typeof PEEK_TYPES)[number]
export type PeekRef = { type: PeekType; id: string }

export const PEEK_PARAM = 'peek'

/** `type:id` → ref. Splits at the first colon, so ids may contain colons. Unknown type or empty id → null. */
export function parsePeek(v: string | null | undefined): PeekRef | null {
  if (!v) return null
  const i = v.indexOf(':')
  if (i < 1) return null
  const type = v.slice(0, i)
  if (!(PEEK_TYPES as readonly string[]).includes(type)) return null
  let id: string
  try { id = decodeURIComponent(v.slice(i + 1)) } catch { return null }
  return id ? { type: type as PeekType, id } : null
}

/** The value of the `peek` param: `type:` plus the percent-encoded id. */
export function peekParam(ref: PeekRef): string {
  return `${ref.type}:${encodeURIComponent(ref.id)}`
}

/**
 * Query string (with its leading `?`, or empty) with `peek` set to `ref`, or removed when `ref` is null.
 * Every other param keeps its order and value. `search` may start with `?` or not.
 */
export function withPeek(search: string, ref: PeekRef | null): string {
  const params = new URLSearchParams(search)
  params.delete(PEEK_PARAM)
  const rest = params.toString()
  if (!ref) return rest ? `?${rest}` : ''
  // The param value is encoded once more by URLSearchParams, so ids holding % or & survive a round trip.
  // The colon after the type stays readable: ?peek=metric:sleep.hours.
  const peek = `${PEEK_PARAM}=${encodeURIComponent(peekParam(ref)).replace('%3A', ':')}`
  return `?${rest ? `${rest}&` : ''}${peek}`
}

/** The ref in a query string, if any. */
export function peekFromSearch(search: string): PeekRef | null {
  return parsePeek(new URLSearchParams(search).get(PEEK_PARAM))
}
