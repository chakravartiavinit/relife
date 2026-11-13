import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { env } from '@/core/env'
import { laptopEnabled, macAppWatching, recordSegments } from '@/core/activity'
import type { User } from '@/core/user'
import { BROWSER_APPS } from '@/domain/activity'

// Which Mac app is in front, every 15 seconds, while you're at the keyboard. App names only: no window
// titles, no screenshots, no keystrokes. Browsers are skipped (the extension covers them). Runs only on
// macOS when Laptop activity is connected and "Mac apps" isn't off.

const run = promisify(execFile)
const TICK = 15_000
const IDLE_AFTER = 120 // seconds without keyboard or mouse

/** The app in front, via lsappinfo (built into macOS, needs no permission prompt). */
async function frontApp() {
  const { stdout: asn } = await run('lsappinfo', ['front'], { timeout: 5000 })
  const { stdout } = await run('lsappinfo', ['info', '-only', 'name', asn.trim()], { timeout: 5000 })
  return stdout.match(/"LSDisplayName"="([^"]*)"/)?.[1] ?? ''
}

/** Seconds since the last keyboard or mouse input (no permission needed). */
async function idleSeconds() {
  const { stdout } = await run('ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { timeout: 5000, maxBuffer: 8 << 20 })
  const ns = stdout.match(/"HIDIdleTime" = (\d+)/)?.[1]
  return ns ? Number(ns) / 1e9 : 0
}

type Open = { id: string; app: string; start: Date; last: Date }

export function startMacActivity(user: User) {
  if (process.platform !== 'darwin') return null
  let open: Open | null = null
  let warned = false
  const save = async (o: Open) => {
    if (o.last.getTime() - o.start.getTime() < 5000) return
    await recordSegments(user, [{ id: o.id, source: 'mac', app: o.app, start: o.start.toISOString(), end: o.last.toISOString() }])
  }
  const tick = async () => {
    try {
      if (env('ACTIVITY_APPS')?.trim().toLowerCase() === 'off' || !(await laptopEnabled(user.id)) || (await macAppWatching(user.id))) {
        // Off, not connected, or the Mac app is watching (it sends app time itself): close what is open.
        if (open) { const o = open; open = null; await save(o) }
        return
      }
      const [app, idle] = await Promise.all([frontApp(), idleSeconds()])
      const now = new Date()
      const away = idle > IDLE_AFTER
      const skip = away || !app || BROWSER_APPS.test(app) || app === 'loginwindow' || app === 'ScreenSaverEngine'
      if (open && (skip || open.app !== app)) {
        // Close the stretch where you were last seen, not now (idle time doesn't count).
        if (away) open.last = new Date(now.getTime() - idle * 1000)
        await save(open)
        open = null
      }
      if (skip) return
      if (!open) open = { id: randomUUID(), app, start: now, last: now }
      else open.last = now
      // Save every minute so a crash loses at most a minute.
      if ((now.getTime() - open.start.getTime()) % 60_000 < TICK) await save(open)
    } catch (e) {
      if (!warned) {
        warned = true
        console.warn('[mac-activity] tick failed:', e instanceof Error ? e.message : e)
      }
    }
  }
  const timer = setInterval(() => void tick().catch(() => {}), TICK) // tick handles its own errors
  void tick().catch(() => {})
  return () => { clearInterval(timer); if (open) save(open).catch((e) => console.warn('[mac-activity] final save failed:', e instanceof Error ? e.message : e)) }
}
