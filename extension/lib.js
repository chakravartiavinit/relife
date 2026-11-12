// Shared by the background worker (importScripts), the popup and the options page (<script>): settings defaults,
// the library item key rule, small formatters, the toast and the connection test. Plain script, no build step; everything hangs off self.RL.

;(() => {
  const DEFAULTS = {
    server: 'http://127.0.0.1:3030', token: '', paused: false, exclude: [], courses: {},
    // Show today's quests left on the toolbar icon.
    badge: true,
  }

  // Same order and colours as the app's Activity page (src/ui/activity-colors.ts).
  const KINDS = [
    ['learning', 'Learning', 'var(--cat-skills)'], ['work', 'Deep work', 'var(--pill)'], ['entertainment', 'Fun', 'var(--cat-health)'],
    ['social', 'Social', 'var(--cat-mind)'], ['communication', 'Messages', 'var(--cat-relationships)'], ['shopping', 'Shopping', 'var(--cat-wealth)'],
    ['news', 'News', 'var(--cat-hobbies)'], ['other', 'Other', 'var(--ink-3)'],
  ]
  const KIND = Object.fromEntries(KINDS.map(([k, label, color]) => [k, { label, color }]))
  // Library item types, as the popup's Track form offers them.
  const TYPES = [['course', 'Course'], ['show', 'Show'], ['video', 'Series'], ['book', 'Book'], ['other', 'Other']]
  const TYPE_LABEL = Object.fromEntries(TYPES)
  // Life areas (src/db/schema.ts CATEGORIES) and their colours (src/ui/tokens.ts).
  const AREA_COLOR = {
    health: 'var(--cat-health)', mind: 'var(--cat-mind)', skills: 'var(--cat-skills)', wealth: 'var(--cat-wealth)',
    hobbies: 'var(--cat-hobbies)', relationships: 'var(--cat-relationships)',
  }

  const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) })

  function domainOf(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null } catch { return null }
  }

  /**
   * Library item key for a URL: a YouTube playlist, or the site plus the first two parts of the path
   * (app.100xdevs.com/new-courses/13).
   */
  function keyOf(url) {
    try {
      const u = new URL(url)
      const host = u.hostname.replace(/^www\./, '')
      const list = /(^|\.)youtube\.com$/.test(host) && u.searchParams.get('list')
      if (list) return `youtube.com/list/${list}`
      return `${host}/${u.pathname.split('/').filter(Boolean).slice(0, 2).join('/')}`
    } catch { return null }
  }

  /** Whether address `a` is the item `k` or a page under it ("site/course/1" is not under "site/course/13"). */
  const under = (a, k) => a === k || a.startsWith(k.endsWith('/') ? k : `${k}/`)

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  /** Seconds as "45m" or "2h 05m". */
  const hm = (sec) => { const m = Math.round(sec / 60); return m < 1 ? (sec > 0 ? '<1m' : '0m') : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
  /** "just now", "4 min ago", "3 h ago", "2 days ago". */
  const ago = (at) => {
    const m = Math.round((Date.now() - at) / 60_000)
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
  }
  /** 1234.5 → "1,235"; small fractions keep one decimal. */
  const num = (v) => (v == null ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) < 10 && v % 1 ? 1 : 0 }).format(v))

  /** Calls ReLife with the saved token. `{ ok, status, data }`; status 0 when ReLife can't be reached. */
  async function call(s, path, init = {}) {
    if (!s.token) return { ok: false, status: 0, data: null }
    try {
      const r = await fetch(`${s.server.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${s.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      })
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  const OFFLINE = 'Can’t reach ReLife at this address'

  /** "x of y" progress a page reported, if it's a real count (whole numbers, y above 1); else null. */
  const progressOf = (done, total) => (Number.isInteger(done) && Number.isInteger(total) && total > 1 && done >= 0 && done <= total ? { done, total } : null)

  /** Saves the address and token and tests them; the result is stored as `lastSync` and returned. */
  async function connect(serverText, tokenText) {
    const server = serverText.trim().replace(/\/$/, '') || DEFAULTS.server
    const token = tokenText.trim()
    await chrome.storage.local.set({ server, token })
    let lastSync
    try {
      const res = await fetch(`${server}/api/activity`, { headers: { Authorization: `Bearer ${token}` } })
      const error = res.ok ? undefined : res.status === 401 ? 'The token doesn’t match the one in ReLife' : `ReLife answered ${res.status}`
      lastSync = { at: Date.now(), ok: res.ok, status: res.status, ...(error ? { error } : {}) }
    } catch {
      lastSync = { at: Date.now(), ok: false, status: 0, error: OFFLINE }
    }
    await chrome.storage.local.set({ lastSync })
    return lastSync
  }

  let toastTimer
  /** A short message in the page's #toast. */
  function toast(text, tone) {
    const t = document.getElementById('toast')
    t.textContent = text
    t.dataset.tone = tone ?? ''
    t.toggleAttribute('data-show', true)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.removeAttribute('data-show'), 3200)
  }

  self.RL = { DEFAULTS, KINDS, KIND, TYPES, TYPE_LABEL, AREA_COLOR, OFFLINE, progressOf, settings, domainOf, keyOf, under, esc, hm, ago, num, call, connect, toast }
  if (typeof module === 'object') module.exports = self.RL
})()
