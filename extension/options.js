// ReLife extension settings: the connection, sync status, sites you don't track, items tracked from this browser
// and the keyboard shortcuts. Everything here lives in chrome.storage; the background worker picks changes up.

const $ = (id) => document.getElementById(id)
const { DEFAULTS, settings, domainOf, esc, ago } = self.RL
const icon = (name) => self.ICON[name] ?? ''
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon)
const TYPE_LABEL = { course: 'Course', show: 'Show', video: 'Series', book: 'Book', other: 'Other' }

let s = DEFAULTS

let toastTimer
function toast(text, tone) {
  const t = $('toast')
  t.textContent = text
  t.dataset.tone = tone ?? ''
  t.toggleAttribute('data-show', true)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.removeAttribute('data-show'), 3200)
}

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
    <span class="fav">${icon({ course: 'course', show: 'show', video: 'video', book: 'book' }[c.kind] ?? 'other')}</span>
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

$('setupForm').onsubmit = async (e) => {
  e.preventDefault()
  const server = $('server').value.trim().replace(/\/$/, '') || DEFAULTS.server
  const token = $('token').value.trim()
  await chrome.storage.local.set({ server, token })
  try {
    const res = await fetch(`${server}/api/activity`, { headers: { Authorization: `Bearer ${token}` } })
    const error = res.ok ? undefined : res.status === 401 ? 'The token doesn’t match the one in ReLife' : `ReLife answered ${res.status}`
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: res.ok, status: res.status, ...(error ? { error } : {}) } })
    toast(res.ok ? 'Connected to ReLife.' : `${error}.`, res.ok ? 'good' : 'bad')
  } catch {
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, status: 0, error: 'Can’t reach ReLife at this address' } })
    toast('Can’t reach ReLife at that address. Is it running?', 'bad')
  }
}

// Live: the popup, the background worker or another settings tab may change things while this is open.
chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') void render() })
// "3 min ago" keeps counting.
setInterval(() => void renderSync(), 30_000)

;(async () => {
  $('version').textContent = `Version ${chrome.runtime.getManifest().version}`
  await render()
  $('server').value = s.server
  $('token').value = s.token
  await renderKeys()
})()
