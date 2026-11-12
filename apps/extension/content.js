// Tells the ReLife extension what this page is: its title, the YouTube channel, whether a video is
// playing (so watching counts as active time), course hints (a lesson name and "x of y" progress), and what's
// playing (series, episode, its length and where you are) for the library's watch log.
// Reads the page only; never sends anything itself and never touches page content.

(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() || undefined
  // Only an episode's own page points at its series; a home or browse page links to dozens of them.
  const episodePage = () => /\/(watch|episode|ep-?\d)/i.test(location.pathname)

  /** "Lesson 7 of 42", "7/42 lessons", a progress bar's aria values, or a course's JSON-LD. */
  function courseHints(deep) {
    const out = {}
    const bar = document.querySelector('[role="progressbar"][aria-valuenow][aria-valuemax]')
    if (bar) {
      const now = Number(bar.getAttribute('aria-valuenow')), max = Number(bar.getAttribute('aria-valuemax'))
      // Only a count of lessons: video players and loaders report fractions (0.47 of 1), which aren't progress.
      if (Number.isInteger(now) && Number.isInteger(max) && max > 1 && now >= 0 && now <= max) { out.done = now; out.total = max }
    }
    // Scanning the page text is costly, so only when asked (opening the popup), not every 20 seconds.
    if (out.done == null && deep) {
      const m = document.body?.innerText?.slice(0, 20000).match(/\b(\d{1,4})\s*(?:\/|of)\s*(\d{1,4})\s*(?:lessons?|videos?|lectures?|modules?|chapters?|completed)/i)
      if (m && Number(m[2]) > 0 && Number(m[1]) <= Number(m[2])) { out.done = Number(m[1]); out.total = Number(m[2]) }
    }
    const lesson = text('[aria-current="page"]') || text('.active .title, .lesson-title, [data-purpose="curriculum-item-title"]')
    if (lesson && lesson.length < 150) out.lesson = lesson
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent || '{}')
        const items = Array.isArray(j) ? j : [j]
        const c = items.find((x) => x && (x['@type'] === 'Course' || x['@type']?.includes?.('Course')))
        if (c?.name) out.courseTitle = String(c.name).slice(0, 200)
      } catch { /* ignore broken JSON-LD */ }
    }
    out.heading = text('h1')?.slice(0, 200)
    out.image = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:image"]'))?.content || undefined
    out.icon = /** @type {HTMLLinkElement | null} */ (document.querySelector('link[rel="apple-touch-icon"]') ?? document.querySelector('link[rel~="icon"][sizes]') ?? document.querySelector('link[rel~="icon"]'))?.href || undefined
    out.siteName = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:site_name"]'))?.content || undefined
    // The series a page belongs to, so every episode or lesson counts toward one show or playlist.
    const yt = /(^|\.)youtube\.com$/.test(location.hostname)
    const list = yt && new URLSearchParams(location.search).get('list')
    if (list) {
      out.series = { title: text('#header-description h3, ytd-playlist-panel-renderer .title, h3.ytd-playlist-panel-renderer') ?? 'YouTube playlist', url: `https://www.youtube.com/playlist?list=${list}` }
    } else {
      /** @type {HTMLAnchorElement | null} */
      const a = episodePage() ? document.querySelector('a[href*="/series/"], a[href*="/show/"], a[href*="/anime/"]') : null
      const crumb = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('nav[aria-label*="readcrumb" i] a, [itemtype*="BreadcrumbList"] a')]).at(-1)
      const link = a ?? crumb
      if (link?.href && link.textContent?.trim()) out.series = { title: link.textContent.trim().slice(0, 200), url: link.href.split('?')[0] }
    }
    return out
  }

  /** The longest video on the page that has a real length: its length and where you are in it, in seconds. */
  function videoClock() {
    const v = [...document.querySelectorAll('video')].filter((x) => Number.isFinite(x.duration) && x.duration > 60).sort((a, b) => b.duration - a.duration)[0]
    return v ? { duration: Math.round(v.duration), position: Math.round(v.currentTime) } : {}
  }

  /**
   * What's playing, for the library's watch log: the series (a show, anime or course), the episode or lesson, its
   * number and season. From the page's structured data (TVEpisode, Episode, VideoObject), its meta tags, and the
   * layouts of common sites. Empty on pages that aren't one episode of something.
   */
  function mediaHints() {
    const m = {}
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent || '{}')
        for (const x of (Array.isArray(j) ? j : j['@graph'] ?? [j])) {
          const t = [x?.['@type']].flat().join(' ')
          if (!/Episode|VideoObject|Movie|LearningResource/.test(t)) continue
          if (x.partOfSeries?.name) { m.series = String(x.partOfSeries.name); m.seriesUrl = x.partOfSeries.url }
          if (x.name && !m.episode) m.episode = String(x.name)
          if (x.episodeNumber != null) m.number = Number(x.episodeNumber)
          if (x.partOfSeason?.seasonNumber != null) m.season = Number(x.partOfSeason.seasonNumber)
        }
      } catch { /* ignore broken JSON-LD */ }
    }
    const meta = (p) => /** @type {HTMLMetaElement | null} */ (document.querySelector(`meta[property="${p}"], meta[name="${p}"]`))?.content || undefined
    // video:series is usually the series page's address, not its name; the site's name isn't a series either.
    const vs = meta('video:series')
    if (!m.series && meta('og:type') === 'video.episode' && vs && !/^https?:/.test(vs)) m.series = vs
    // Crunchyroll and most anime sites: a link to the series page, and the episode title as the heading.
    if (!m.series) {
      const a = /** @type {HTMLAnchorElement | null} */ (document.querySelector('a[href*="/series/"], a[href*="/anime/"], a[href*="/show/"]'))
      if (a?.textContent?.trim() && episodePage()) { m.series = a.textContent.trim(); m.seriesUrl = a.href.split('?')[0] }
    }
    if (m.series) {
      const h = text('h1')
      if (!m.episode && h) m.episode = h
      // "E5 - The Name", "Episode 5: The Name", "S2 E5"
      const n = /(?:^|\b)(?:S(\d+)\s*)?(?:E|Ep\.?|Episode)\s*(\d+)\b/i.exec(m.episode ?? '')
      if (n) { if (m.number == null) m.number = Number(n[2]); if (n[1] && m.season == null) m.season = Number(n[1]) }
      m.series = m.series.slice(0, 200)
      if (m.episode) m.episode = m.episode.replace(/^\s*(?:S\d+\s*)?(?:E|Ep\.?|Episode)\s*\d+\s*[-–:|·]\s*/i, '').slice(0, 200) || m.episode
      Object.assign(m, videoClock())
    }
    return m.series ? m : undefined
  }

  function info(deep = false) {
    const yt = /(^|\.)youtube\.com$/.test(location.hostname)
    const videos = [...document.querySelectorAll('video')]
    const playing = videos.some((v) => !v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0)
    return {
      title: document.title,
      channel: yt ? text('#owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a') : undefined,
      playing,
      media: mediaHints(),
      ...courseHints(deep),
    }
  }

  // When the extension is reloaded or updated, this copy of the script stays in open tabs but can no longer reach
  // it, and sendMessage throws ("Extension context invalidated") instead of rejecting. Then stop for good: the
  // new copy takes over once the tab reloads.
  let stopped = false
  const stops = []
  function post(msg) {
    if (stopped) return
    try {
      if (!chrome.runtime?.id) throw new Error('extension reloaded')
      chrome.runtime.sendMessage(msg).catch(() => {})
    } catch {
      stopped = true
      stops.forEach((stop) => stop())
    }
  }
  const every = (fn, ms) => { const t = setInterval(fn, ms); stops.push(() => clearInterval(t)) }

  // Inside an embedded player (iframe): only say whether a video is playing, for the page's tab.
  if (window !== window.top) {
    const send = () => {
      // Ads and widgets are iframes too; only a frame with a player has anything to say.
      if (stopped || !document.querySelector('video')) return
      const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.currentTime > 0)
      post({ type: 'frame', playing, ...videoClock() })
    }
    document.addEventListener('play', send, true)
    document.addEventListener('pause', send, true)
    document.addEventListener('ended', send, true)
    every(send, 20000)
    return
  }

  let last = ''
  function report() {
    if (stopped) return
    const i = info()
    const key = JSON.stringify(i)
    if (key === last) return
    last = key
    post({ type: 'page', info: i })
  }

  report()
  document.addEventListener('play', report, true)
  document.addEventListener('pause', report, true)
  const watcher = new MutationObserver(report)
  watcher.observe(document.querySelector('title') ?? document.head, { childList: true, subtree: true, characterData: true })
  stops.push(() => watcher.disconnect())
  every(report, 20000)
  chrome.runtime.onMessage.addListener((msg, _s, reply) => { if (msg.type === 'course-info') reply(info(true)) })
})()
