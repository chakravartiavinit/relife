// ReLife popup. Today: your level, today's quests and routines (check them off here), a quick log and screen time.
// This page: what the site counts as and the library item it belongs to.
// Reads from your ReLife (/api/companion and /api/activity?view=1); everything else stays in chrome.storage.

const $ = (id) => document.getElementById(id)
const { DEFAULTS, KINDS, KIND, AREA_COLOR, domainOf, keyOf, under, esc, hm, ago, num, call } = self.RL
const TYPES = [['course', 'Course'], ['show', 'Show'], ['video', 'Series'], ['book', 'Book'], ['other', 'Other']]
const TYPE_ICON = { course: 'course', show: 'show', video: 'video', book: 'book', other: 'other' }
// System quest ranks, as on Today (src/ui/components/system-quests.tsx).
const RANK_HINT = { E: 'easy', D: 'light', C: 'steady', B: 'hard', A: 'very hard', S: 'rare' }

let s = DEFAULTS      // settings
let tab = null        // the active tab
let domain = null
let page = {}         // what the content script says about this page
let type = 'course'   // chosen in the Track form
let view = null       // the Today data (/api/companion)
let busy = new Set()  // routines and goals with a save in flight

const load = async () => ({ ...DEFAULTS, lastSync: null, ...(await chrome.storage.local.get([...Object.keys(DEFAULTS), 'lastSync'])) })
const icon = (name) => self.ICON[name] ?? ''
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon)
$('favicon').onerror = () => { $('favicon').style.visibility = 'hidden' }
$('favicon').onload = () => { $('favicon').style.visibility = '' }
$('openSettings').innerHTML = icon('settings')
$('closeSettings').innerHTML = icon('back')
$('logSend').innerHTML = icon('enter')
const base = () => s.server.replace(/\/$/, '')

function trackedHere() {
  const own = tab?.url ? keyOf(tab.url) : null
  const series = page.series?.url ? keyOf(page.series.url) : null
  const key = Object.keys(s.courses).find((k) => (own && under(own, k)) || (series && under(series, k)))
  return key ? s.courses[key] : null
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

// ── Tabs ───────────────────────────────────────────────────────────────────────────────────────

const TABS = [['today', 'tabToday', 'todayPanel'], ['page', 'tabPage', 'pagePanel']]
function setTab(name, focus = false) {
  for (const [n, tabId, panelId] of TABS) {
    const on = n === name
    $(tabId).setAttribute('aria-selected', String(on))
    $(tabId).tabIndex = on ? 0 : -1
    $(panelId).hidden = !on
    if (on && focus) $(tabId).focus()
  }
  document.body.dataset.tab = name
  void chrome.storage.local.set({ popupTab: name })
}
$('tabToday').onclick = () => setTab('today')
$('tabPage').onclick = () => setTab('page')
// Arrow keys move between tabs (WAI-ARIA tabs pattern).
for (const [, tabId] of TABS) {
  $(tabId).onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setTab(document.body.dataset.tab === 'today' ? 'page' : 'today', true)
  }
}

// ── Header ─────────────────────────────────────────────────────────────────────────────────────

function renderStatus() {
  const st = $('status')
  const [state, text] = !s.token ? ['none', 'Not set up'] : s.paused ? ['paused', 'Paused'] : s.lastSync?.ok ? ['on', 'Tracking'] : s.lastSync ? ['off', 'Offline'] : ['none', 'Waiting']
  st.dataset.state = state
  st.querySelector('.status-text').textContent = text
  // The pill is also the pause switch: its words and icon say which way it goes.
  st.disabled = !s.token
  st.setAttribute('aria-pressed', String(s.paused))
  st.setAttribute('aria-label', s.paused ? 'Paused. Resume tracking' : `${text}. Pause tracking`)
  st.title = state === 'off' ? `${s.lastSync?.error ?? 'Can’t reach ReLife'}. Click to pause.` : s.paused ? 'Resume tracking' : s.token ? 'Pause tracking' : ''
  $('statusIc').innerHTML = s.token ? icon(s.paused ? 'play' : 'pause') : ''
}

// ── Today tab ──────────────────────────────────────────────────────────────────────────────────

/** Not set up, can't reach ReLife (and nothing cached), or a ReLife too old for the Today tab. */
function renderNotice(kind) {
  $('todaySkeleton').hidden = true
  $('todayNotice').hidden = !kind
  $('todayCards').hidden = !!kind
  if (!kind) return
  const [ic, title, text, btn] = {
    setup: ['plus', 'Connect ReLife', 'See your level and today’s quests here, check routines off and log things without opening the app.', 'Connect'],
    offline: ['refresh', 'Can’t reach ReLife', s.lastSync?.error && s.lastSync.status ? s.lastSync.error : `Nothing answered at ${base()}. Is ReLife running?`, 'Try again'],
    old: ['sparkles', 'Update ReLife for this tab', 'This ReLife doesn’t share quests with the extension yet. Pull the latest ReLife and restart it.', 'Try again'],
  }[kind]
  $('noticeIc').innerHTML = icon(ic)
  $('noticeTitle').textContent = title
  $('noticeText').textContent = text
  $('noticeBtn').textContent = btn
  $('noticeBtn').onclick = kind === 'setup' ? () => setView('settings') : () => void loadToday(true)
}

function renderHero(v) {
  const c = v.character
  $('lv').textContent = `Lv ${c.level}`
  $('heroTitle').textContent = c.title
  $('heroSub').textContent = `${num(Math.max(0, c.next - c.total))} XP to level ${c.level + 1}`
  $('xpToday').textContent = c.todayXp > 0 ? `+${num(c.todayXp)} XP today` : ''
  const pct = Math.round(Math.min(1, Math.max(0, c.progress)) * 100)
  $('xpBar').style.setProperty('--p', `${pct}%`)
  $('xpBar').setAttribute('aria-valuenow', String(pct))
  $('xpBar').setAttribute('aria-label', `Level ${c.level} progress: ${pct}%`)
  // The streak only counts once today has something done; until then it's at risk, said in words too.
  const streak = c.streak > 0
    ? `<span class="stat${c.doneToday ? ' on' : ' risk'}">${icon('flame')}${c.streak}-day streak${c.doneToday ? '' : ' · do one thing today'}</span>`
    : '<span class="stat">' + icon('flame') + 'No streak yet</span>'
  const freezes = c.freezes > 0 ? `<span class="stat">${icon('snowflake')}${c.freezes} ${c.freezes === 1 ? 'freeze' : 'freezes'}</span>` : ''
  $('stats').innerHTML = streak + freezes
}

function progressText(value, target, unit) {
  return `${num(value)} of ${num(target)}${unit ? ` ${esc(unit)}` : ''}`
}

/** A System quest: cleared by your data, so it shows progress only. */
function questRow(q) {
  const color = AREA_COLOR[q.area] ?? 'var(--pill)'
  const done = q.status === 'cleared', failed = q.status === 'failed', neutral = q.status === 'unverified' || q.status === 'cancelled'
  const tag = done ? `<span class="tag good">${icon('check')}+${q.xp} XP</span>`
    : failed ? '<span class="tag bad">Failed</span>'
      : neutral ? `<span class="tag">${q.status === 'unverified' ? 'No data' : 'Retired'}</span>`
        : `<span class="tag gold">+${q.xp} XP</span>`
  const value = q.progress ?? 0
  const over = q.op === 'lte' && value > q.target
  const bar = !done && !failed && !neutral && q.progress != null
    ? `<div class="capsule thin" style="--p:${Math.min(100, (Math.min(value, q.target) / (q.target || 1)) * 100)}%;--c:${over ? 'var(--bad)' : q.op === 'lte' ? 'var(--good)' : color}"><span class="fill"></span></div>`
    : ''
  const sub = done || failed || neutral ? '' : q.progress == null ? 'No measurement yet' : `${q.op === 'lte' ? 'At most ' : ''}${progressText(value, q.target, q.unit)}`
  return `<li class="row-item${done || failed || neutral ? ' resolved' : ''}">
    <span class="q-ic" style="--c:${color}" aria-hidden="true">${icon('swords')}<span class="rank" title="Rank ${esc(q.rank)}: ${RANK_HINT[q.rank] ?? ''}">${esc(q.rank)}</span></span>
    <span class="row-text"><span class="row-title">${esc(q.title)}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}${bar}</span>
    ${tag}
  </li>`
}

/** A quantity goal (water): progress and a quick-add of its usual step. */
function goalRow(g) {
  const met = g.value >= g.target
  const color = AREA_COLOR[g.area] ?? 'var(--pill)'
  const pct = Math.min(100, (g.value / (g.target || 1)) * 100)
  return `<li class="row-item${met ? ' met' : ''}">
    <span class="row-text"><span class="row-title">${esc(g.name)}</span><span class="row-sub">${met ? `${icon('check')}` : ''}${progressText(g.value, g.target, g.unit)}</span>
      <div class="capsule thin" style="--p:${pct}%;--c:${met ? 'var(--good)' : color}"><span class="fill"></span></div></span>
    <button class="btn small add" type="button" data-goal="${esc(g.scheduleId)}" data-step="${g.step}" ${busy.has(g.scheduleId) ? 'disabled' : ''} aria-label="Add ${num(g.step)}${g.unit ? ` ${esc(g.unit)}` : ''} to ${esc(g.name)}">+${num(g.step)}</button>
  </li>`
}

/** A routine or medicine: one tap checks it off (or undoes it). */
function routineRow(r) {
  const done = r.status === 'done', skipped = r.status === 'skipped', missed = r.status === 'missed'
  const key = `${r.scheduleId}|${r.occurrence}`
  const color = AREA_COLOR[r.area] ?? 'var(--pill)'
  const sub = [r.time, missed ? '<span class="warn-text">Missed</span>' : '', skipped ? 'Skipped' : ''].filter(Boolean).join(' · ')
  return `<li class="row-item${done || skipped ? ' resolved' : ''}">
    <button class="check" type="button" role="checkbox" aria-checked="${done}" data-key="${esc(key)}" style="--c:${color}" ${busy.has(key) || skipped ? 'disabled' : ''}
      aria-label="${esc(r.name)} at ${esc(r.time)}${done ? ', done. Undo' : skipped ? ', skipped' : '. Mark done'}"><span class="box">${done ? icon('check') : ''}</span></button>
    <span class="row-text"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${sub}</span></span>
    ${r.xp && !skipped ? `<span class="tag${done ? ' good' : ''}">+${r.xp} XP</span>` : ''}
  </li>`
}

function renderQuests(v) {
  // Open ones first; finished ones step back below them.
  const order = (a, b) => Number(a.status !== 'active') - Number(b.status !== 'active')
  $('systemList').innerHTML = [...v.quests].sort(order).map(questRow).join('')
  $('goalList').innerHTML = v.goals.map(goalRow).join('')
  const rorder = (a, b) => Number(a.status === 'done' || a.status === 'skipped') - Number(b.status === 'done' || b.status === 'skipped')
  $('routineList').innerHTML = [...v.routines].sort(rorder).map(routineRow).join('')
  const any = v.quests.length + v.goals.length + v.routines.length
  $('questEmpty').hidden = any > 0
  $('questNote').textContent = !any ? '' : v.left > 0 ? `${v.left} left` : 'All done'
  $('questNote').dataset.tone = any && !v.left ? 'good' : ''
  $('leftCount').hidden = !v.left
  $('leftCount').textContent = v.left ? String(v.left) : ''
  $('leftCount').setAttribute('aria-label', `${v.left} left`)
  for (const b of $('routineList').querySelectorAll('.check')) b.onclick = () => void toggleRoutine(b.dataset.key)
  for (const b of $('goalList').querySelectorAll('.add')) b.onclick = () => void addToGoal(b.dataset.goal, Number(b.dataset.step))
}

function renderScreen(focus) {
  $('openActivity').href = `${base()}/activity`
  if (!focus) { $('todayTotal').textContent = '–'; $('todayBar').innerHTML = ''; $('todayLegend').innerHTML = ''; return }
  $('todayTotal').textContent = hm(focus.seconds)
  const parts = focus.byKind.filter((k) => k.seconds >= 30)
  const kindOf = (k) => KIND[k] ?? KIND.other
  $('todayBar').innerHTML = parts.map((k) => `<span style="--c:${kindOf(k.kind).color};flex:${Number(k.seconds) || 0}"></span>`).join('')
  $('todayBar').setAttribute('aria-label', `Today: ${parts.map((k) => `${kindOf(k.kind).label} ${hm(k.seconds)}`).join(', ') || 'nothing yet'}`)
  $('todayLegend').innerHTML = parts.length
    ? parts.slice(0, 4).map((k) => `<li style="--c:${kindOf(k.kind).color}">${esc(kindOf(k.kind).label)}<span class="t">${hm(k.seconds)}</span></li>`).join('')
    : '<li style="--c:var(--ink-3)">Nothing tracked yet today</li>'
}

/** Paints the Today tab from `view`. `at` is when it was fetched; `stale` when the latest fetch failed. */
function renderToday(at, stale) {
  $('openToday').href = `${base()}/`
  if (!view) return
  renderNotice(null)
  renderHero(view)
  renderQuests(view)
  renderScreen(view.focus)
  $('stamp').textContent = stale ? `Can’t reach ReLife. Showing what it said ${ago(at)}.` : ''
  $('stamp').dataset.tone = stale ? 'bad' : ''
}

/** Paint the cached copy at once, then fetch a fresh one. */
async function loadToday(force = false) {
  if (!s.token) { view = null; renderNotice('setup'); return }
  const { companion } = await chrome.storage.local.get('companion')
  if (!force && companion?.view && !view) { view = companion.view; renderToday(companion.at, false) }
  if (!view) renderSkeleton()
  const r = await call(s, '/api/companion')
  if (r.ok && r.data) {
    view = r.data
    await chrome.storage.local.set({ companion: { at: Date.now(), view } })
    renderToday(Date.now(), false)
  } else if (r.status === 404) {
    view = null
    renderNotice('old')
  } else if (view) {
    renderToday(companion?.at ?? Date.now(), true)
  } else {
    renderNotice('offline')
  }
}

/** First open with nothing cached: placeholders sized like the cards, until ReLife answers. */
function renderSkeleton() {
  $('todayNotice').hidden = true
  $('todayCards').hidden = true
  $('todaySkeleton').hidden = false
}

/** Saves a check or a log, then repaints with what ReLife sends back. Level-ups and achievements get a toast. */
async function post(body) {
  const r = await call(s, '/api/companion', { method: 'POST', body: JSON.stringify(body) })
  if (r.ok && r.data?.view) {
    view = r.data.view
    await chrome.storage.local.set({ companion: { at: Date.now(), view } })
  }
  const news = r.data?.news
  if (news?.levelUp) toast(`Level ${news.levelUp.level}${news.levelUp.newTitle ? ` · ${news.levelUp.title}` : ''}! Keep going.`, 'good')
  else if (news?.unlocked?.length) toast(`Unlocked: ${news.unlocked.map((u) => u.name).join(', ')}`, 'good')
  return r
}

async function toggleRoutine(key) {
  const r0 = view?.routines.find((r) => `${r.scheduleId}|${r.occurrence}` === key)
  if (!r0 || busy.has(key)) return
  const status = r0.status === 'done' ? null : 'done'
  // Shown at once; put back if ReLife says no.
  const before = r0.status
  r0.status = status ?? (new Date(r0.occurrence).getTime() + 3_600_000 < Date.now() ? 'missed' : 'pending')
  busy.add(key)
  renderQuests(view)
  const res = await post({ action: 'check', scheduleId: r0.scheduleId, occurrence: r0.occurrence, status })
  busy.delete(key)
  if (!res.ok) { r0.status = before; toast(res.data?.error ?? 'Can’t reach ReLife. Nothing changed.', 'bad') }
  renderToday(Date.now(), false)
  if (res.ok && status === 'done') {
    const box = $('routineList').querySelector(`[data-key="${CSS.escape(key)}"] svg`)
    box?.classList.add('pop')
  }
  $('routineList').querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus()
}

async function addToGoal(id, amount) {
  if (busy.has(id)) return
  const g = view?.goals.find((x) => x.scheduleId === id)
  if (!g) return
  busy.add(id)
  g.value += amount
  renderQuests(view)
  const res = await post({ action: 'add', scheduleId: id, amount })
  busy.delete(id)
  if (!res.ok) { g.value -= amount; toast(res.data?.error ?? 'Can’t reach ReLife. Nothing changed.', 'bad') }
  else if (!res.data?.news?.levelUp) toast(`${g.name}: +${num(amount)}${g.unit ? ` ${g.unit}` : ''}.`, 'good')
  renderToday(Date.now(), false)
  $('goalList').querySelector(`[data-goal="${CSS.escape(id)}"]`)?.focus()
}

$('logInput').oninput = () => { $('logSend').disabled = !$('logInput').value.trim() }
$('logForm').onsubmit = async (e) => {
  e.preventDefault()
  const text = $('logInput').value.trim()
  if (!text || $('logInput').readOnly) return
  $('logInput').readOnly = true
  $('logSend').disabled = true
  const res = await post({ action: 'log', text })
  $('logInput').readOnly = false
  if (res.ok) {
    $('logInput').value = ''
    if (!res.data?.news?.levelUp && !res.data?.news?.unlocked?.length) toast(res.data?.message ?? 'Logged.', 'good')
    renderToday(Date.now(), false)
  } else {
    $('logSend').disabled = false
    toast(res.data?.error ?? (res.status === 404 ? 'Update ReLife to log from here.' : 'Can’t reach ReLife. Nothing was logged.'), 'bad')
  }
  $('logInput').focus()
}

// ── This page tab ──────────────────────────────────────────────────────────────────────────────

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
  $('pageEmpty').hidden = !!domain
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
  if (r?.ok) void refreshPage()
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
  cover.style.backgroundImage = item?.image ? `url("${base()}/api/library/${item.id}/image")` : ''
  cover.innerHTML = item?.image ? '' : icon(TYPE_ICON[kind] ?? 'other')
  $('itemLink').href = `${base()}/${kind === 'show' ? 'hobbies' : 'skills'}`
  $('itemBar').hidden = !item?.total
  if (item?.total) $('itemBar').style.setProperty('--p', `${Math.min(100, (item.done / item.total) * 100)}%`)
}

/** Pull this page's numbers from ReLife and redraw. */
async function refreshPage() {
  s = await load()
  renderStatus()
  renderActions()
  const local = trackedHere()
  const q = new URLSearchParams({ view: '1', ...(domain ? { domain } : {}), ...(local?.url ? { item: local.url } : {}) })
  const r = await call(s, `/api/activity?${q}`)
  renderSite(r.ok ? r.data?.site ?? null : null)
  renderItem(local, r.ok ? r.data?.item ?? null : null)
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
  await refreshPage()
  $('itemKind').querySelector('svg')?.classList.add('pop')
}

// ── Pause, exclude, settings ───────────────────────────────────────────────────────────────────

$('status').onclick = async () => {
  await chrome.storage.local.set({ paused: !s.paused })
  await refreshPage()
  toast(s.paused ? 'Tracking paused. Nothing is sent until you resume.' : 'Tracking again.')
}
$('exclude').onclick = async () => {
  if (!domain) return
  const exclude = s.exclude.includes(domain) ? s.exclude.filter((x) => x !== domain) : [...s.exclude, domain]
  await chrome.storage.local.set({ exclude })
  await refreshPage()
  toast(exclude.includes(domain) ? `${domain} won’t be tracked.` : `${domain} is tracked again.`)
}

$('openSettings').onclick = () => setView('settings')
$('closeSettings').onclick = () => setView('main')
$('openOptions').onclick = () => chrome.runtime.openOptionsPage()
$('setupForm').onsubmit = async (e) => {
  e.preventDefault()
  const server = $('server').value.trim().replace(/\/$/, '') || DEFAULTS.server
  const token = $('token').value.trim()
  await chrome.storage.local.set({ server, token })
  try {
    const res = await fetch(`${server}/api/activity`, { headers: { Authorization: `Bearer ${token}` } })
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: res.ok, status: res.status, ...(res.ok ? {} : { error: res.status === 401 ? 'The token doesn’t match the one in ReLife' : `ReLife answered ${res.status}` }) } })
    toast(res.ok ? 'Connected to ReLife.' : res.status === 401 ? 'That token doesn’t match the one in ReLife.' : `ReLife answered ${res.status}.`, res.ok ? 'good' : 'bad')
    if (res.ok) { $('setupIntro').hidden = true; setView('main') }
  } catch {
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, status: 0, error: 'Can’t reach ReLife at this address' } })
    toast('Can’t reach ReLife at that address. Is it running?', 'bad')
  }
  await refreshPage()
  view = null
  await loadToday(true)
}

;(async () => {
  s = await load()
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  domain = tab?.url ? domainOf(tab.url) : null
  if (tab?.id && domain) page = await chrome.tabs.sendMessage(tab.id, { type: 'course-info' }).catch(() => ({}))
  $('server').value = s.server
  $('token').value = s.token
  const { popupTab } = await chrome.storage.local.get('popupTab')
  // First paint: no transitions (the popup opens straight onto setup, a tab, or main).
  document.body.classList.add('no-motion')
  setTab(popupTab === 'page' ? 'page' : 'today')
  if (!s.token) { $('setupIntro').hidden = false; setView('settings') }
  else setView('main', false)
  requestAnimationFrame(() => document.body.classList.remove('no-motion'))
  if (!domain) $('siteSub').textContent = ''
  // Opened with the shortcut (Alt+Shift+R) or a click, the quick log is ready to type into.
  const typeable = () => s.token && document.body.dataset.tab === 'today' && document.body.dataset.view === 'main' && !$('todayCards').hidden
  await Promise.all([refreshPage(), loadToday().then(() => { if (typeable() && !document.activeElement?.matches('input, button')) $('logInput').focus() })])
})()
