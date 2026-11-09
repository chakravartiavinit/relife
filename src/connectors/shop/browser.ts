import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext } from 'playwright-core'

// One Chrome profile per app, kept in data/browser/<id> (git-ignored, like the key file). You log in
// once in a visible window; syncs reuse the saved session in a hidden one. Uses your installed Chrome
// (or CHROME_PATH), so nothing extra is downloaded.

const profileDir = (id: string) => {
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'browser', id)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function launch(id: string, headless: boolean): Promise<BrowserContext> {
  const { chromium } = await import('playwright-core')
  const executablePath = process.env.CHROME_PATH || undefined
  // One Chrome per profile: if another sync of this app is running (web "Sync now" and the worker can
  // overlap), wait for it instead of failing.
  const acquire = async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await start() } catch (e) {
        if (!/ProcessSingleton|already in use/i.test(String(e)) || attempt >= 8) {
          throw /ProcessSingleton|already in use/i.test(String(e)) ? new Error(`Another ${id} sync is still running. Try again in a minute.`) : e
        }
        await new Promise((r) => setTimeout(r, 8000))
      }
    }
  }
  const start = () => chromium.launchPersistentContext(profileDir(id), {
    headless,
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
    viewport: headless ? { width: 1280, height: 900 } : null,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    args: ['--disable-blink-features=AutomationControlled'],
    // Look like the Chrome you use every day: no "controlled by automated software" flag, and the normal sandbox
    // (Playwright turns it off by default, which shows a --no-sandbox warning). Bot walls like MakeMyTrip's
    // treat either as a robot and answer with "You are offline".
    ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
    chromiumSandbox: true,
  })
  const ctx = await acquire()
  if (headless) {
    // Bot walls (Blinkit's says "access denied") block the "HeadlessChrome" user agent. Use the
    // same agent your visible Chrome sends, in headers and in navigator.userAgent.
    const probe = ctx.pages()[0] ?? (await ctx.newPage())
    const ua = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome')
    await ctx.setExtraHTTPHeaders({ 'user-agent': ua })
    await ctx.addInitScript((agent) => {
      Object.defineProperty(navigator, 'userAgent', { get: () => agent })
      Object.defineProperty(navigator, 'appVersion', { get: () => agent.replace(/^Mozilla\//, '') })
    }, ua)
  }
  return ctx
}

// On globalThis so a code reload in dev doesn't forget a window that's still open.
const g = globalThis as unknown as { __shopLogins?: Map<string, ChildProcess> }
const open = (g.__shopLogins ??= new Map<string, ChildProcess>())

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * Opens the login page in a plain Chrome window on the app's profile. Not driven by Playwright: bot walls
 * (MakeMyTrip's) spot a remote-controlled window and silently drop the login request. `--use-mock-keychain`
 * matches what the hidden sync windows use, so they can read the cookies this window saves. On a Mac, closing the
 * window leaves Chrome running; pressing Connect quits it (closeLoginWindow), which writes the login to disk.
 */
export async function openLoginWindow(id: string, url: string) {
  await closeLoginWindow(id)
  // turbopackIgnore: the bundler would otherwise trace the profile folder (and crash on Chrome's lock links).
  const args = [`--user-data-dir=${profileDir(id)}`, '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--new-window', url]
  const p = spawn(/* turbopackIgnore: true */ CHROME, args, { stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { p.once('spawn', resolve); p.once('error', reject) })
  open.set(id, p)
  p.once('exit', () => { if (open.get(id) === p) open.delete(id) })
}

/** Quits a login window (keeps the saved cookies). Called when you press Connect. */
export async function closeLoginWindow(id: string) {
  const p = open.get(id)
  if (!p) return
  open.delete(id)
  if (p.exitCode != null || p.signalCode != null) return
  const exited = new Promise((r) => p.once('exit', r))
  p.kill('SIGTERM') // Chrome shuts down cleanly on SIGTERM and flushes its cookies
  await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))])
}

export const loginWindowOpen = (id: string) => open.has(id)

/** Loads a page in a hidden window with the saved session; collects the JSON it fetches and its text. */
export async function readPage(id: string, url: string, opts: { scrolls?: number } = {}) {
  if (open.has(id)) throw new Error('Finish logging in, then press Connect and sync again.')
  const ctx = await launch(id, true)
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    const json: unknown[] = []
    page.on('response', async (res) => {
      if (!/json/i.test(res.headers()['content-type'] ?? '')) return
      try { json.push(await res.json()) } catch { /* not JSON after all, or body gone */ }
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // Order lists load more as you scroll.
    // Order lists load more as you scroll: scroll the page and any inner scrolling list, and press
    // "Load more" style buttons when there are any. Stops early once the page stops growing.
    let last = 0
    for (let i = 0; i < (opts.scrolls ?? 12); i++) {
      await page.mouse.wheel(0, 2400)
      const grew = await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('*')) {
          if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight
        }
        const more = [...document.querySelectorAll<HTMLElement>('button, a, [role=button]')].find((b) => /^(load|show|view) more/i.test(b.innerText.trim()))
        more?.click()
        return document.body.innerText.length
      })
      await page.waitForTimeout(1300)
      if (i > 2 && grew === last) break
      last = grew
    }
    const text = await page.evaluate(() => document.body.innerText).catch(() => '')
    return { finalUrl: page.url(), json, text }
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * Opens several pages one after another in a single hidden window (much faster than one launch each)
 * and hands each page's JSON to `onPage`. Stops early if a page lands on a login screen.
 */
export async function readPages(id: string, urls: string[], onPage: (i: number, json: unknown[]) => Promise<void>) {
  let i = 0
  if (urls.length) await walk(id, urls[0], async (json) => { await onPage(i, json); return urls[++i] ?? null })
}

/**
 * Follows a chain of pages in one hidden window: `step` gets each page's JSON (and what `scrape` read
 * from it) and returns the next address, or null to stop. A JSON address is read straight away; a web
 * page first settles. Stops on a login screen.
 */
export async function walk<T = undefined>(
  id: string, first: string,
  step: (json: unknown[], scraped: T | undefined) => Promise<string | null>,
  scrape?: () => T, max = 400,
) {
  if (open.has(id)) throw new Error('Finish logging in, then press Connect and sync again.')
  const ctx = await launch(id, true)
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    let json: unknown[] = []
    page.on('response', async (res) => {
      if (!/json/i.test(res.headers()['content-type'] ?? '')) return
      try { json.push(await res.json()) } catch { /* body gone */ }
    })
    let url: string | null = first
    for (let n = 0; url && n < max; n++) {
      json = []
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null)
      if (/json/i.test(res?.headers()['content-type'] ?? '')) {
        json = [await res!.json().catch(() => null)]
      } else {
        await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
        await page.waitForTimeout(1500) // late requests after the page settles
      }
      if (/\/(log-?in|sign-?in)\b/i.test(new URL(page.url()).pathname)) break
      url = await step(json, scrape ? await page.evaluate(scrape).catch(() => undefined) : undefined)
    }
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * For apps whose order pages only load from a click (Blinkit): open the list, click one order to see
 * the request the app makes, then repeat that request for every other order with the ids swapped.
 * Runs inside the page, so it carries the same session and headers the app itself sends.
 */
export async function replayDetails(id: string, opts: {
  listUrl: string; click: RegExp; match: RegExp; urlFor: (template: string, key: string) => string; keys: string[]
  onJson: (i: number, json: unknown) => Promise<void>
}) {
  if (open.has(id)) throw new Error('Finish logging in, then press Connect and sync again.')
  const ctx = await launch(id, true)
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    let req: { url: string; method: string; headers: Record<string, string>; body: string | null } | null = null
    page.on('request', (r) => { if (!req && opts.match.test(r.url())) req = { url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() } })
    await page.goto(opts.listUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.getByText(opts.click).first().click({ timeout: 10_000 })
    for (let t = 0; t < 20 && !req; t++) await page.waitForTimeout(250)
    const captured = req as { url: string; method: string; headers: Record<string, string>; body: string | null } | null
    if (!captured) throw new Error('Couldn’t open an order to read its items.')
    // Browser-managed headers can't be set from fetch; the page adds them itself.
    const headers = Object.fromEntries(Object.entries(captured.headers).filter(([h]) => !/^(sec-|user-agent|referer|origin|cookie|host|content-length|connection)/i.test(h)))
    for (let i = 0; i < opts.keys.length; i++) {
      const url = opts.urlFor(captured.url, opts.keys[i])
      const json = await page.evaluate(async ({ url, method, headers, body }) => {
        const r = await fetch(url, { method, headers, body: body ?? undefined, credentials: 'include' })
        return r.ok ? r.json().catch(() => null) : null
      }, { url, method: captured.method, headers, body: captured.body })
      if (json) await opts.onJson(i, json)
      await page.waitForTimeout(400) // gentle on their servers
    }
  } finally {
    await ctx.close().catch(() => {})
  }
}
