import { join, resolve } from 'node:path'

// Runtime state (the key that encrypts saved connector keys, Chrome profiles, caches) lives in data/ at the repo root,
// outside apps/web. The server always runs with apps/web as its working directory (npm -w apps/web, the LaunchAgent),
// so the repo root is two levels up. RELIFE_DATA_DIR moves the whole folder (a backup disk, a container volume).

const root = () => resolve(/* turbopackIgnore: true */ process.cwd(), '..', '..')

/** The data folder, or a path inside it: `dataDir('browser', id)`. */
export function dataDir(...parts: string[]) {
  return join(process.env.RELIFE_DATA_DIR || join(root(), 'data'), ...parts)
}
