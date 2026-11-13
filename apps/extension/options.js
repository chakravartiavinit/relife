// ReLife extension settings: the connection, sync status, sites you don't track, items tracked from this browser
// and the keyboard shortcuts. Everything here lives in chrome.storage; the background worker picks changes up.

/** DOM glue: elements are looked up by id and used as whatever they are, so this stays untyped. The data is what is typed. */
const $ = /** @type {(id: string) => any} */ ((id) => document.getElementById(id))
const { DEFAULTS, TYPE_LABEL, settings, domainOf, esc, ago, connect, toast, serverOf, hostPattern, allowServer, pairStart, pairPoll } = self.RL
const icon = (name) => self.ICON[name] ?? ''
for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-icon]'))) el.innerHTML = icon(el.dataset.icon)

let s = DEFAULTS

const fact = (label, value, tone) => `<dt>${esc(label)}</dt><dd${tone ? ` class="${tone}"` : ''}>${value}</dd>`

async function renderSync() {
  const { lastSync, queue = [], pendingCourses = [], pendingRules = [], companion } =
    await chrome.storage.local.get(['lastSync', 'queue', 'pendingCourses', 'pendingRules', 'companion'])
  const status = !s.token ? ['Not set up', ''] : s.paused ? ['Paused', ''] : lastSync?.ok ? ['Tracking', 'good'] : lastSync ? ['Offline', 'bad'] : ['Waiting for the first send', '']
  const last = !lastSync ? 'Never'
    : lastSync.ok ? `${ago(lastSync.at)}, OK`
      : `${ago(lastSync.at)}: ${esc(lastSync.error ?? (lastSync.status ? `ReLife answered ${lastSync.status}` : 'Can’t reach ReLife'))}`
  const waiting = [queue.length ? `${queue.length} ${queue.length === 1 ? 'stretch' : 'stretches'}` : '', pendingCourses.length ? `${pendingCourses.length} library ${pendingCourses.length === 1 ? 'item' : 'items'}` : '', pendingRules.length ? `${pendingRules.length} site ${pendingRules.length === 1 ? 'choice' : 'choices'}` : '']
    .filter(Boolean).join(', ') || 'Nothing'
  $('facts').innerHTML = fact('Status', status[0], status[1])
    + fact('Last sent', last, lastSync && !lastSync.ok ? 'bad' : '')
    + fact('Waiting to send', waiting)
    + fact('Quests last updated', companion?.at ? (companion.unsupported ? 'This ReLife is too old for the Today tab' : ago(companion.at)) : 'Not yet')
  $('sendNow').disabled = !s.token
  $('paused').checked = !!s.paused
  $('paused').disabled = !s.token
  $('badge').checked = s.badge !== false
  $('pairBtn').textContent = s.token ? 'Connect again' : 'Connect'
}

function renderExclude() {
  const list = [...s.exclude].sort()
  $('excludeEmpty').hidden = list.length > 0
  $('excludeList').innerHTML = list.map((d) => `<li>
    <span class="fav"><img alt="" src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(`https://${d}`)}&size=32" /></span>
    <span class="m-text"><span class="m-title">${esc(d)}</span></span>
    <button class="icon-btn" type="button" data-d="${esc(d)}" aria-label="Track ${esc(d)} again" title="Track again">${icon('x')}</button>
  </li>`).join('')
  for (const b of $('excludeList').querySelectorAll('button')) b.onclick = () => void unexclude(b.dataset.d)
}

function renderCourses() {
  const entries = Object.entries(s.courses).sort((a, b) => a[1].title.localeCompare(b[1].title))
  $('courseEmpty').hidden = entries.length > 0
  $('courseList').innerHTML = entries.map(([key, c]) => `<li>
    <span class="fav">${icon(TYPE_LABEL[c.kind] ? c.kind : 'other')}</span>
    <span class="m-text"><span class="m-title">${esc(c.title)}</span><span class="m-sub">${esc(TYPE_LABEL[c.kind] ?? 'Item')} · ${esc(key)}</span></span>
    <button class="icon-btn" type="button" data-k="${esc(key)}" aria-label="Stop tracking ${esc(c.title)} from this browser" title="Stop tracking here">${icon('trash')}</button>
  </li>`).join('')
  for (const b of $('courseList').querySelectorAll('button')) b.onclick = () => void removeCourse(b.dataset.k)
}

async function renderKeys() {
  const commands = await chrome.commands.getAll()
  const name = (c) => c.name === '_execute_action' ? 'Open ReLife' : c.description || c.name
  $('keys').innerHTML = commands.map((c) => fact(name(c), c.shortcut ? c.shortcut.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join(' ') : '<span class="hint">Not set</span>')).join('')
}

async function render() {
  s = await settings()
  $('openApp').href = s.server
  renderExclude()
  renderCourses()
  await renderSync()
}

async function unexclude(d) {
  await chrome.storage.local.set({ exclude: s.exclude.filter((x) => x !== d) })
  toast(`${d} is tracked again.`)
}

async function removeCourse(key) {
  const title = s.courses[key]?.title ?? key
  const courses = { ...s.courses }
  delete courses[key]
  const { pendingCourses = [] } = await chrome.storage.local.get('pendingCourses')
  await chrome.storage.local.set({ courses, pendingCourses: pendingCourses.filter((c) => `${c.domain}${c.path}` !== key) })
  toast(`This browser no longer counts time toward “${title}”.`)
}

/** "https://www.example.com/x", "example.com" → "example.com"; null when it isn't a site. */
function siteOf(text) {
  const t = text.trim().toLowerCase()
  if (!t) return null
  const d = domainOf(/^https?:\/\//.test(t) ? t : `https://${t}`)
  return d && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}

$('excludeInput').oninput = () => { $('excludeAdd').disabled = !$('excludeInput').value.trim() }
$('excludeForm').onsubmit = async (e) => {
  e.preventDefault()
  const d = siteOf($('excludeInput').value)
  if (!d) { toast('That doesn’t look like a site. Try example.com.', 'bad'); return }
  if (!s.exclude.includes(d)) await chrome.storage.local.set({ exclude: [...s.exclude, d] })
  $('excludeInput').value = ''
  $('excludeAdd').disabled = true
  toast(`${d} won’t be tracked.`)
}

$('paused').onchange = async () => {
  await chrome.storage.local.set({ paused: $('paused').checked })
  toast($('paused').checked ? 'Tracking paused. Nothing is sent until you resume.' : 'Tracking again.')
}
$('badge').onchange = () => chrome.storage.local.set({ badge: $('badge').checked })

$('sendNow').onclick = async () => {
  $('sendNow').disabled = true
  await chrome.runtime.sendMessage({ type: 'flush' }).catch(() => null)
  const { lastSync } = await chrome.storage.local.get('lastSync')
  toast(lastSync?.ok ? 'Sent to ReLife.' : `Not sent: ${lastSync?.error ?? 'can’t reach ReLife'}. It stays queued.`, lastSync?.ok ? 'good' : 'bad')
  $('sendNow').disabled = !s.token
}

$('editKeys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })

const failText = (r) => (r.status ? `${r.error}.` : 'Can’t reach a server at that address. Is it running?')

// ── Page details: opt-in access to websites ─────────────────────────────────────────────────────

// Chrome asks the user; background.js registers the content script once the access is granted.
const ALL_SITES = { origins: ['http://*/*', 'https://*/*'] }

async function renderPages() {
  $('pages').checked = await chrome.permissions.contains(ALL_SITES)
}

$('pages').onchange = async () => {
  if ($('pages').checked) {
    // Called first in the click, so Chrome still counts it as the user's action.
    const ok = await chrome.permissions.request(ALL_SITES).catch(() => false)
    toast(ok ? 'Page details are on. Reload open tabs to include them.' : 'Chrome didn’t give access, so page details stay off.', ok ? 'good' : 'bad')
  } else {
    const fixed = chrome.runtime.getManifest().host_permissions ?? []
    const { origins = [] } = await chrome.permissions.getAll()
    await chrome.permissions.remove({ origins: origins.filter((o) => /^https?:/.test(o) && !fixed.includes(o) && !isServerPattern(o)) })
    // A server on another computer may have been reachable only through the all-sites access just removed.
    const lost = await chrome.permissions.contains({ origins: [hostPattern(s.server)] }).then((ok) => !ok).catch(() => false)
    toast(lost ? 'Page details are off. Press Connect again so Chrome lets the extension reach your server.' : 'Page details are off.', lost ? 'bad' : 'good')
  }
  await renderPages()
}
const isServerPattern = (o) => { try { return o === hostPattern(s.server) } catch { return false } }
chrome.permissions.onAdded.addListener(() => void renderPages())
chrome.permissions.onRemoved.addListener(() => void renderPages())

// ── Connection: pairing (a code to type in the app) or a pasted token ───────────────────────────

/** @type {{ stop: () => void } | null} */
let pairing = null

function showPairing(on) {
  $('pairing').hidden = !on
  $('pairForm').hidden = on
}

/** Starts a pairing request and waits, on this page (the popup closes when you go to the app), until the app approves it. */
async function pair(server) {
  const { started, error } = await pairStart(server)
  if (!started) { toast(error ?? 'Couldn’t start connecting.', 'bad'); $('pairBtn').disabled = false; return }
  let stopped = false
  let timer
  pairing = { stop: () => { stopped = true; clearTimeout(timer); pairing = null; showPairing(false); $('pairBtn').disabled = false } }
  $('pairCode').textContent = `${started.userCode.slice(0, 4)}-${started.userCode.slice(4)}`
  $('pairOpen').href = started.approveUrl
  $('pairStatus').textContent = 'Waiting for you to type this code in the app.'
  showPairing(true)

  const end = Date.parse(started.expiresAt)
  let failures = 0
  let wait = Math.max(2, started.interval) * 1000
  const tick = async () => {
    if (stopped) return
    if (Date.now() > end) { pairing?.stop(); toast('That code expired. Press Connect for a new one.', 'bad'); return }
    const r = await pairPoll(server, started)
    if (stopped) return
    failures = r.status === 'error' ? failures + 1 : 0
    if (r.status === 'slow') wait += 1000
    if (r.status === 'denied') { pairing?.stop(); toast('The request was denied in the app.', 'bad'); return }
    if (r.status === 'expired') { pairing?.stop(); toast('That code expired. Press Connect for a new one.', 'bad'); return }
    if (failures >= 5) { pairing?.stop(); toast('error' in r && r.error ? `${r.error}.` : 'Lost the connection.', 'bad'); return }
    if (r.status === 'approved') {
      const token = 'token' in r ? r.token : undefined
      pairing?.stop()
      if (!token) { toast('The server approved this browser but sent no sign-in. Try again.', 'bad'); return }
      const result = await connect(server, token)
      $('token').value = token
      toast(result.ok ? 'Connected.' : failText(result), result.ok ? 'good' : 'bad')
      return
    }
    timer = setTimeout(() => void tick(), wait)
  }
  timer = setTimeout(() => void tick(), wait)
}

$('pairForm').onsubmit = async (e) => {
  e.preventDefault()
  const server = serverOf($('server').value)
  if (!server) { toast('That doesn’t look like an address. Try http://127.0.0.1:3030.', 'bad'); return }
  $('pairBtn').disabled = true
  // First await in the click: another computer's address needs Chrome's yes, which counts as the user's action only here.
  if (!(await allowServer(server))) { toast('Chrome needs your OK to reach that address.', 'bad'); $('pairBtn').disabled = false; return }
  await pair(server)
}
$('pairCancel').onclick = () => pairing?.stop()

$('setupForm').onsubmit = async (e) => {
  e.preventDefault()
  const server = serverOf($('server').value)
  if (!server) { toast('That doesn’t look like an address. Try http://127.0.0.1:3030.', 'bad'); return }
  if (!(await allowServer(server))) { toast('Chrome needs your OK to reach that address.', 'bad'); return }
  const r = await connect(server, $('token').value)
  toast(r.ok ? 'Connected to ReLife.' : failText(r), r.ok ? 'good' : 'bad')
}

// Live: the popup, the background worker or another settings tab may change things while this is open.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return
  s = await settings()
  // Only what changed, so the lists keep keyboard focus while stretches and sync results land every 30 seconds.
  if ('exclude' in changes) renderExclude()
  if ('courses' in changes) renderCourses()
  if ('server' in changes) $('openApp').href = s.server
  void renderSync()
})
// "3 min ago" keeps counting.
setInterval(() => void renderSync(), 30_000)

;(async () => {
  $('version').textContent = `Version ${chrome.runtime.getManifest().version}`
  await render()
  await renderPages()
  $('server').value = s.server
  $('token').value = s.token
  await renderKeys()
})()
