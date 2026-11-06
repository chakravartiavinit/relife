// Connected keys live in this map, not in process.env. Changing process.env inside the Next dev
// server makes Turbopack rebuild and reload the page in a loop, so applySecrets() fills this instead.
// No imports: connectors, the bot and the AI layer all read through here.

const g = globalThis as unknown as { __relifeKeys?: Map<string, string | undefined> }

/** A connector key: the connected value if ReLife manages it, else plain process.env. */
export function env(name: string): string | undefined {
  const m = g.__relifeKeys
  return m?.has(name) ? m.get(name) : process.env[name] || undefined
}

export function setKeys(values: Map<string, string | undefined>) {
  g.__relifeKeys = values
}
