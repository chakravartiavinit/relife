// Connected keys live in these maps, not in process.env. Changing process.env inside the Next dev
// server makes Turbopack rebuild and reload the page in a loop, so applySecrets() fills them instead.
// No imports: connectors, the bot and the AI layer all read through here.
//
// A key has a scope (core/integrations.ts `isInstanceKey`):
//   instance  AI provider keys, LLM_*, the Telegram bot token, OAuth app credentials. One value for the whole server,
//             set by the owner (`__relifeInstanceKeys`, then process.env).
//   user      connector keys and tokens. One value per person (`__relifeUserKeys`), read for the person `runAs()` set.
// With exactly one person loaded and no `runAs()`, a user key reads that person's value: that is how a single-user
// install, a script and the tests behave. With several, no `runAs()` means no answer: it fails closed, so one person's
// Binance key can never serve another.

type Keys = Map<string, string | undefined>
const g = globalThis as unknown as {
  __relifeInstanceKeys?: Keys
  __relifeUserKeys?: Map<string, Keys>
  __relifeKeyScope?: Set<string>
  __relifeMulti?: boolean
  __relifeScope?: { getStore(): { user: { id: string } } | undefined }
  __relifeWarned?: Set<string>
}

const warn = (name: string) => {
  const seen = (g.__relifeWarned ??= new Set())
  if (seen.has(name)) return
  seen.add(name)
  console.error(`[env] ${name} was read outside a signed-in context while several people share this server: returning nothing. Wrap the code in runAs(user, …).`)
}

/** A connector key: the connected value if ReLife manages it, else plain process.env. */
export function env(name: string): string | undefined {
  if (g.__relifeKeyScope?.has(name)) {
    const m = g.__relifeInstanceKeys
    return m?.has(name) ? m.get(name) : process.env[name] || undefined
  }
  const users = g.__relifeUserKeys
  if (!users?.size) return process.env[name] || undefined
  const me = g.__relifeScope?.getStore()?.user.id
  let m = me ? users.get(me) : undefined
  if (!m && !me) {
    if (users.size === 1 && !g.__relifeMulti) m = users.values().next().value
    else {
      // Several people: only a managed key is withheld; anything else (RELIFE_PUBLIC_URL, …) is the server's own.
      for (const k of users.values()) if (k.has(name)) { warn(name); return undefined }
      return process.env[name] || undefined
    }
  }
  return m?.has(name) ? m.get(name) : process.env[name] || undefined
}

/** One person's key by id, for code that handles several people in one go (a notification to someone else). */
export function envFor(userId: string, name: string): string | undefined {
  if (g.__relifeKeyScope?.has(name)) return env(name)
  const m = g.__relifeUserKeys?.get(userId)
  return m?.has(name) ? m.get(name) : process.env[name] || undefined
}

/** Fill one person's keys. The first call with nothing else loaded is also the single-user fallback. */
export function setUserKeys(userId: string, values: Keys) {
  ;(g.__relifeUserKeys ??= new Map()).set(userId, values)
}

/** Forget a person's keys (they were removed). */
export function dropUserKeys(userId: string) {
  g.__relifeUserKeys?.delete(userId)
}

export function setInstanceKeys(values: Keys, names: Iterable<string>) {
  g.__relifeInstanceKeys = values
  g.__relifeKeyScope = new Set(names)
}

/** Said by the code that lists people (`warmInstance`, the worker): more than one means no fallback to "the" user. */
export function setMulti(multi: boolean) {
  g.__relifeMulti = multi
}

/** For tests: forget everything. */
export function resetKeys() {
  g.__relifeInstanceKeys = undefined
  g.__relifeUserKeys = undefined
  g.__relifeKeyScope = undefined
  g.__relifeMulti = false
  g.__relifeWarned = undefined
}

/** The whole user-key map for one anonymous person: tests and scripts that set keys without a database. */
export function setKeys(values: Keys) {
  g.__relifeUserKeys = new Map([['', values]])
}
