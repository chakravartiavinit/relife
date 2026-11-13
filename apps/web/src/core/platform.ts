import brand from '@relife/brand/brand.json'

// What the Docker image can't do. The image has no visible Chrome window, so the shopping apps (sign-in through Chrome on
// your own computer) don't run there.

export const inContainer = (env: Record<string, string | undefined> = process.env) => env.RELIFE_CONTAINER === '1'

export const SHOP_IN_DOCKER = `Shopping apps sign in through Chrome on your own computer, so they can't run in Docker. Run ${brand.name} on your Mac or PC to use them.`

/** Why this connector can't run here, or null when it can. */
export function connectorUnavailable(c: { login?: unknown }, env: Record<string, string | undefined> = process.env): string | null {
  return c.login && inContainer(env) ? SHOP_IN_DOCKER : null
}
