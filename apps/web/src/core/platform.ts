import brand from '@relife/brand/brand.json'

// What the Docker image can't do. The image has no visible Chrome window, so the shopping apps (sign-in through Chrome on
// your own computer) don't run there.

export const inContainer = (env: Record<string, string | undefined> = process.env) => env.RELIFE_CONTAINER === '1'

export const SHOP_IN_DOCKER = `Shopping apps sign in through Chrome on your own computer, so they can't run in Docker. Run ${brand.name} on your Mac or PC to use them.`

export const HOST_LOCAL = 'This reads the computer that runs the server, so only the person who runs the server can connect it.'

/**
 * Why this connector can't run here, or null when it can. `member`: the person is not the owner of a server with other
 * people on it, so a connector that reads the host's own files, network or screen (`hostLocal`) is closed to them.
 */
export function connectorUnavailable(c: { login?: unknown; hostLocal?: boolean }, env: Record<string, string | undefined> = process.env, member = false): string | null {
  if (c.hostLocal && member) return HOST_LOCAL
  return c.login && inContainer(env) ? SHOP_IN_DOCKER : null
}
