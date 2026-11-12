import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Runtime state (the key that encrypts saved connector keys, Chrome profiles, caches) lives in data/ at the repo root,
// outside apps/web. The server always runs with apps/web as its working directory (npm -w apps/web, the LaunchAgent),
// and the repo root is found by walking up to the package.json with workspaces, so scripts run from anywhere. RELIFE_DATA_DIR moves the whole folder (a backup disk, a container volume).

/** The folder whose package.json declares workspaces (the repo root), found by walking up from the working directory. */
let cached: string | undefined
function root() {
  if (cached) return cached
  let dir = resolve(/* turbopackIgnore: true */ process.cwd())
  for (;;) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg) && 'workspaces' in JSON.parse(readFileSync(pkg, 'utf8'))) return (cached = dir)
    const up = dirname(dir)
    if (up === dir) throw new Error('Cannot find the repo root (a package.json with workspaces) above ' + process.cwd())
    dir = up
  }
}

/** The data folder, or a path inside it: `dataDir('browser', id)`. */
export function dataDir(...parts: string[]) {
  return join(process.env.RELIFE_DATA_DIR || join(root(), 'data'), ...parts)
}
