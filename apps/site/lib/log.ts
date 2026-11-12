// Server-side error logging that cannot leak a signup. Postgres/Drizzle errors carry the SQL parameters (the email,
// the token hash) and Resend errors can echo the recipient, so log a short description, never the error object.
const EMAIL = /[^\s@"'<>(),]+@[^\s@"'<>(),]+\.[^\s@"'<>(),]+/g
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g

export function describeError(e: unknown): string {
  if (!(e instanceof Error)) return 'non-error thrown'
  const root = (e as { cause?: unknown }).cause ?? e
  const { code, constraint_name } = root as { code?: unknown; constraint_name?: unknown }
  const message = e.message.split('\nparams:')[0].replace(EMAIL, '[email]').replace(TOKEN, '[token]').slice(0, 300)
  return [e.name, typeof code === 'string' ? code : '', typeof constraint_name === 'string' ? constraint_name : '', message].filter(Boolean).join(' ')
}

export const logError = (what: string, e: unknown) => console.error(`${what}: ${describeError(e)}`)
