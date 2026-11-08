// ReLife popup: this site (what it counts as), the library item it belongs to, and today's time.
// Reads from your ReLife (/api/activity?view=1); everything else stays in chrome.storage.

const $ = (id) => document.getElementById(id)
const DEFAULTS = { server: 'http://127.0.0.1:3030', token: '', paused: false, exclude: [], courses: {}, lastSync: null }
// Same order and colours as the app's Activity page (src/ui/activity-colors.ts).
const KINDS = [
  ['learning', 'Learning', 'var(--cat-skills)'], ['work', 'Deep work', 'var(--pill)'], ['entertainment', 'Fun', 'var(--cat-health)'],
  ['social', 'Social', 'var(--cat-mind)'], ['communication', 'Messages', 'var(--cat-relationships)'], ['shopping', 'Shopping', 'var(--cat-wealth)'],
  ['news', 'News', 'var(--cat-hobbies)'], ['other', 'Other', 'var(--ink-3)'],
]
const KIND = Object.fromEntries(KINDS.map(([k, label, color]) => [k, { label, color }]))
const TYPES = [['course', 'Course'], ['show', 'Show'], ['video', 'Series'], ['book', 'Book'], ['other', 'Other']]
const TYPE_ICON = { course: 'course', show: 'show', video: 'video', book: 'book', other: 'other' }

let s = DEFAULTS      // settings
let tab = null        // the active tab
let domain = null
let page = {}         // what the content script says about this page
let type = 'course'   // chosen in the Track form

const load = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) })
const domainOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null } catch { return null } }
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const hm = (sec) => { const m = Math.round(sec / 60); return m < 1 ? (sec > 0 ? '<1m' : '0m') : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
const icon = (name) => self.ICON[name] ?? ''
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon)
$('favicon').onerror = () => { $('favicon').style.visibility = 'hidden' }
$('favicon').onload = () => { $('favicon').style.visibility = '' }
$('openSettings').innerHTML = icon('settings')
$('closeSettings').innerHTML = icon('back')

/** Same key rule as background.js: a YouTube playlist, or site plus the first two parts of the path. */
function keyOf(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const list = /(^|\.)youtube\.com$/.test(host) && u.searchParams.get('list')
    if (list) return `youtube.com/list/${list}`
    return `${host}/${u.pathname.split('/').filter(Boolean).slice(0, 2).join('/')}`
  } catch { return null }
}
/** Same as background.js: `a` is the item `k` or a page under it ("site/course/1" isn't under "site/course/13"). */
const under = (a, k) => a === k || a.startsWith(k.endsWith('/') ? k : `${k}/`)
function trackedHere() {
  const own = tab?.url ? keyOf(tab.url) : null
  const series = page.series?.url ? keyOf(page.series.url) : null
  const key = Object.keys(s.courses).find((k) => (own && under(own, k)) || (series && under(series, k)))
  return key ? s.courses[key] : null
}

async function api(path) {
  if (!s.token) return null
  try {
    const r = await fetch(`${s.server}${path}`, { headers: { Authorization: `Bearer ${s.token}` } })
    return r.ok ? r.json() : null
  } catch { return null }
}

let toastTimer
function toast(text, tone) {
  const t = $('toast')
  t.textContent = text
  t.dataset.tone = tone ?? ''
  t.toggleAttribute('data-show', true)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.removeAttribute('data-show'), 3200)
}

function setView(v, focus = true) {
  document.body.dataset.view = v
  $('mainView').inert = v !== 'main'
  $('settingsView').inert = v !== 'settings'
  if (focus) (v === 'settings' ? $(s.token ? 'server' : 'token') : $('openSettings')).focus()
}

function renderStatus() {
  const st = $('status')
  const [state, text] = !s.token ? ['none', 'Not set up'] : s.paused ? ['paused', 'Paused'] : s.lastSync?.ok ? ['on', 'Tracking'] : s.lastSync ? ['off', 'Offline'] : ['none', 'Waiting']
  st.dataset.state = state
  st.querySelector('.status-text').textContent = text
  // The pill is also the pause switch: its words and icon say which way it goes.
  st.disabled = !s.token
  st.setAttribute('aria-pressed', String(s.paused))
  st.setAttribute('aria-label', s.paused ? 'Paused. Resume tracking' : `${text}. Pause tracking`)
  st.title = state === 'off' ? 'Can’t reach ReLife. Is it running? Click to pause.' : s.paused ? 'Resume tracking' : s.token ? 'Pause tracking' : ''
  $('statusIc').innerHTML = s.token ? icon(s.paused ? 'play' : 'pause') : ''
}

function renderActions() {
  const excluded = domain && s.exclude.includes(domain)
  $('exclude').innerHTML = icon(excluded ? 'eyeOff' : 'eye')
  $('exclude').setAttribute('aria-pressed', String(!!excluded))
  $('exclude').setAttribute('aria-label', excluded ? 'This site isn’t tracked. Track it again' : 'Don’t track this site')
  $('exclude').title = excluded ? 'Track this site again' : 'Don’t track this site'
  $('exclude').disabled = !domain
}

/** The site card: name, today's time and the kind chips. */
function renderSite(site) {
  $('nowCard').hidden = !domain
  $('libCard').hidden = !domain
  if (!domain) return
  $('site').textContent = domain
  $('favicon').src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`
  const kind = site?.kind
  const excluded = s.exclude.includes(domain)
  $('siteSub').textContent = excluded ? 'Not tracked on this browser'
    : site ? `${hm(site.seconds)} today · ${KIND[kind]?.label ?? 'Other'}${site.custom ? ' (your pick)' : ''}`
    : s.token ? 'Can’t reach ReLife right now' : 'Connect ReLife to see your time'
  $('kinds').innerHTML = KINDS.map(([k, label, color]) =>
    `<button type="button" class="chip" role="radio" aria-checked="${k === kind}" data-k="${k}" style="--c:${color}" ${site ? '' : 'disabled'}>${label}</button>`).join('')
  for (const b of $('kinds').querySelectorAll('.chip')) b.onclick = () => pickKind(b.dataset.k)
}

async function pickKind(k) {
  for (const b of $('kinds').querySelectorAll('.chip')) b.setAttribute('aria-checked', String(b.dataset.k === k))
  const r = await chrome.runtime.sendMessage({ type: 'site-kind', domain, kind: k }).catch(() => ({}))
  toast(r?.ok ? `${domain} now counts as ${KIND[k].label.toLowerCase()}, past time too.` : 'Saved here; it reaches ReLife when it’s running.', r?.ok ? 'good' : 'bad')
  if (r?.ok) void refresh()
}

/** The library card: the tracked item with its cover and progress, or the Track button. */
function renderItem(local, item) {
  const tracked = local || item
  $('itemView').hidden = !tracked
  $('trackStart').hidden = !!tracked || $('trackReveal').hasAttribute('data-open')
  if (!tracked) return
  const kind = item?.kind ?? local?.kind ?? 'course'
  const label = (TYPES.find(([k]) => k === kind) ?? TYPES[0])[1]
  $('itemKind').innerHTML = `${icon(TYPE_ICON[kind] ?? 'other')}${label}${item?.status === 'done' ? ' · Finished' : ''}`
  $('itemTitle').textContent = item?.title ?? local.title
  const bits = []
  if (item) bits.push(`${hm(item.minutes * 60)} spent`)
  if (item?.current) bits.push(`Now: ${item.current}`)
  else if (item?.total) bits.push(`${item.done} of ${item.total} done`)
  $('itemSub').textContent = bits.join(' · ') || 'Time fills in as you watch or read'
  const cover = $('itemCover')
  cover.className = `cover${item?.iconOnly ? ' logo' : ''}`
  cover.style.backgroundImage = item?.image ? `url("${s.server}/api/library/${item.id}/image")` : ''
  cover.innerHTML = item?.image ? '' : icon(TYPE_ICON[kind] ?? 'other')
  $('itemLink').href = `${s.server}/${kind === 'show' ? 'hobbies' : 'skills'}`
  $('itemBar').hidden = !item?.total
  if (item?.total) $('itemBar').style.setProperty('--p', `${Math.min(100, (item.done / item.total) * 100)}%`)
}

function renderToday(today) {
  $('openActivity').href = `${s.server}/activity`
  if (!today) { $('todayTotal').textContent = '–'; $('todayBar').innerHTML = ''; $('todayLegend').innerHTML = ''; return }
  $('todayTotal').textContent = hm(today.seconds)
  const parts = today.byKind.filter((k) => k.seconds >= 30)
  const kindOf = (k) => KIND[k] ?? KIND.other
  $('todayBar').innerHTML = parts.map((k) => `<span style="--c:${kindOf(k.kind).color};flex:${Number(k.seconds) || 0}"></span>`).join('')
  $('todayBar').setAttribute('aria-label', `Today: ${parts.map((k) => `${kindOf(k.kind).label} ${hm(k.seconds)}`).join(', ') || 'nothing yet'}`)
  $('todayLegend').innerHTML = parts.length
    ? parts.slice(0, 4).map((k) => `<li style="--c:${kindOf(k.kind).color}">${esc(kindOf(k.kind).label)}<span class="t">${hm(k.seconds)}</span></li>`).join('')
    : '<li style="--c:var(--ink-3)">Nothing tracked yet today</li>'
}

/** Pull this page's numbers from ReLife and redraw. */
async function refresh() {
  s = await load()
  renderStatus()
  renderActions()
  const local = trackedHere()
  const q = new URLSearchParams({ view: '1', ...(domain ? { domain } : {}), ...(local?.url ? { item: local.url } : {}) })
  const data = await api(`/api/activity?${q}`)
  renderSite(data?.site ?? null)
  renderItem(local, data?.item ?? null)
  renderToday(data?.today ?? null)
}

// Track form
function suggestName() {
  if ((type === 'show' || type === 'video') && page.series?.title) return page.series.title
  return page.courseTitle || page.heading || page.series?.title || page.title || ''
}
function scopeText() {
  const series = page.series?.url && (type === 'show' || type === 'video')
  return series ? 'Every episode of this series counts toward it.' : `Every page under ${keyOf(tab.url)} counts toward it${page.total ? ` · ${page.done} of ${page.total} done` : ''}.`
}
function renderTypes() {
  $('types').innerHTML = TYPES.map(([k, l]) => `<button type="button" class="chip" role="radio" aria-checked="${k === type}" data-k="${k}">${l}</button>`).join('')
  for (const b of $('types').querySelectorAll('.chip')) b.onclick = () => { type = b.dataset.k; renderTypes(); $('trackName').value = suggestName(); $('scope').textContent = scopeText() }
}
function openTrack(open) {
  $('trackReveal').toggleAttribute('data-open', open)
  $('trackForm').inert = !open
  $('trackStart').hidden = open
}

$('trackBtn').onclick = async () => {
  page = await chrome.tabs.sendMessage(tab.id, { type: 'course-info' }).catch(() => page)
  // A guess from the site: video sites with a series are shows; YouTube playlists are video series.
  type = /crunchyroll|netflix|primevideo|hotstar|disneyplus|hianime|aniwatch|9anime/.test(domain) ? 'show' : /youtube/.test(domain) && page.series ? 'video' : 'course'
  renderTypes()
  $('trackName').value = suggestName()
  $('scope').textContent = scopeText()
  $('cover').hidden = !page.image
  // The page chose this address; quoted as a CSS string so it can't break out of url().
  if (page.image) $('cover').style.backgroundImage = `url(${JSON.stringify(page.image)})`
  openTrack(true)
  $('trackName').focus()
}
$('trackCancel').onclick = () => { openTrack(false); $('trackBtn').focus() }

$('trackForm').onsubmit = async (e) => {
  e.preventDefault()
  const title = $('trackName').value.trim()
  if (!title) return
  const useSeries = page.series?.url && (type === 'show' || type === 'video')
  const key = keyOf(useSeries ? page.series.url : tab.url)
  const itemUrl = `https://${key}`
  await chrome.storage.local.set({ courses: { ...s.courses, [key]: { title, kind: type, url: itemUrl } } })
  const [host, ...rest] = key.split('/')
  const course = { domain: host, path: `/${rest.join('/')}`, title, url: itemUrl, kind: type, ...(page.image ? { image: page.image } : page.icon ? { icon: page.icon } : {}), ...(page.total ? { done: page.done, total: page.total } : {}) }
  openTrack(false)
  const r = await chrome.runtime.sendMessage({ type: 'track-course', course }).catch(() => ({ ok: false }))
  const where = type === 'show' ? 'Hobbies → Watching' : 'Skills → Learning'
  toast(r?.ok ? `“${title}” added to ${where}.` : 'Saved here; it reaches ReLife when it’s running.', r?.ok ? 'good' : 'bad')
  await refresh()
  $('itemKind').querySelector('svg')?.classList.add('pop')
}

// Footer actions
$('status').onclick = async () => {
  await chrome.storage.local.set({ paused: !s.paused })
  await refresh()
  toast(s.paused ? 'Tracking paused. Nothing is sent until you resume.' : 'Tracking again.')
}
$('exclude').onclick = async () => {
  if (!domain) return
  const exclude = s.exclude.includes(domain) ? s.exclude.filter((x) => x !== domain) : [...s.exclude, domain]
  await chrome.storage.local.set({ exclude })
  await refresh()
  toast(exclude.includes(domain) ? `${domain} won’t be tracked.` : `${domain} is tracked again.`)
}

// Settings
$('openSettings').onclick = () => setView('settings')
$('closeSettings').onclick = () => setView('main')
$('setupForm').onsubmit = async (e) => {
  e.preventDefault()
  const server = $('server').value.trim().replace(/\/$/, '') || DEFAULTS.server
  const token = $('token').value.trim()
  await chrome.storage.local.set({ server, token })
  try {
    const res = await fetch(`${server}/api/activity`, { headers: { Authorization: `Bearer ${token}` } })
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: res.ok, status: res.status } })
    toast(res.ok ? 'Connected to ReLife.' : res.status === 401 ? 'That token doesn’t match the one in ReLife.' : `ReLife answered ${res.status}.`, res.ok ? 'good' : 'bad')
    if (res.ok) { $('setupIntro').hidden = true; setView('main') }
  } catch {
    toast('Can’t reach ReLife at that address. Is it running?', 'bad')
  }
  await refresh()
}

;(async () => {
  s = await load()
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  domain = tab?.url ? domainOf(tab.url) : null
  if (tab?.id && domain) page = await chrome.tabs.sendMessage(tab.id, { type: 'course-info' }).catch(() => ({}))
  $('server').value = s.server
  $('token').value = s.token
  // First run opens on setup; the view switch is instant then (nothing to slide from).
  if (!s.token) { $('setupIntro').hidden = false; document.body.classList.add('no-motion'); setView('settings'); requestAnimationFrame(() => document.body.classList.remove('no-motion')) }
  else setView('main', false)
  if (!domain) $('siteSub').textContent = ''
  await refresh()
})()
