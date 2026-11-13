// Which connectors need the user and which connect in one field. Pure: Connections draws them, tests pin them.

type Fixable = {
  connected: boolean; status: 'ok' | 'error' | 'setup' | 'off' | 'waiting' | 'ready'
  oauth?: { signedIn: boolean } | null
}
type Inlinable = { fields: { secret?: boolean }[]; oauth?: unknown; login?: boolean }

/** Failing, a key missing, or a sign-in left unfinished. "First sync running" is waiting too, but needs nothing from the user. */
export const needsFix = (c: Fixable) =>
  c.connected && (c.status === 'error' || c.status === 'setup' || (c.status === 'waiting' && !!c.oauth && !c.oauth.signedIn))

/** One visible field, no key, no sign-in and no browser login: connect it inline, checked on submit. */
export const isInline = (c: Inlinable) => c.fields.length === 1 && !c.fields[0].secret && !c.oauth && !c.login
