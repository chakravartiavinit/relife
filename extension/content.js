// Tells the ReLife extension what this page is: its title, the YouTube channel, whether a video is
// playing (so watching counts as active time), and course hints (a lesson name and "x of y" progress).
// Reads the page only; never sends anything itself and never touches page content.

(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() || undefined

  /** "Lesson 7 of 42", "7/42 lessons", a progress bar's aria values, or a course's JSON-LD. */
  function courseHints(deep) {
    const out = {}
    const bar = document.querySelector('[role="progressbar"][aria-valuenow][aria-valuemax]')
    if (bar) {
      const now = Number(bar.getAttribute('aria-valuenow')), max = Number(bar.getAttribute('aria-valuemax'))
      if (max > 0 && now >= 0 && now <= max) { out.done = now; out.total = max }
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
    out.image = document.querySelector('meta[property="og:image"]')?.content || undefined
    out.icon = (document.querySelector('link[rel="apple-touch-icon"]') ?? document.querySelector('link[rel~="icon"][sizes]') ?? document.querySelector('link[rel~="icon"]'))?.href || undefined
    out.siteName = document.querySelector('meta[property="og:site_name"]')?.content || undefined
    // The series a page belongs to, so every episode or lesson counts toward one show or playlist.
    const yt = /(^|\.)youtube\.com$/.test(location.hostname)
    const list = yt && new URLSearchParams(location.search).get('list')
    if (list) {
      out.series = { title: text('#header-description h3, ytd-playlist-panel-renderer .title, h3.ytd-playlist-panel-renderer') ?? 'YouTube playlist', url: `https://www.youtube.com/playlist?list=${list}` }
    } else {
      const a = document.querySelector('a[href*="/series/"], a[href*="/show/"], a[href*="/anime/"]')
      const crumb = [...document.querySelectorAll('nav[aria-label*="readcrumb" i] a, [itemtype*="BreadcrumbList"] a')].at(-1)
      const link = a ?? crumb
      if (link?.href && link.textContent?.trim()) out.series = { title: link.textContent.trim().slice(0, 200), url: link.href.split('?')[0] }
    }
    return out
  }

  function info(deep = false) {
    const yt = /(^|\.)youtube\.com$/.test(location.hostname)
    const videos = [...document.querySelectorAll('video')]
    const playing = videos.some((v) => !v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0)
    return {
      title: document.title,
      channel: yt ? text('#owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a') : undefined,
      playing,
      ...courseHints(deep),
    }
  }

  // Inside an embedded player (iframe): only say whether a video is playing, for the page's tab.
  if (window !== window.top) {
    const send = () => {
      const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.currentTime > 0)
      chrome.runtime.sendMessage({ type: 'frame', playing }).catch(() => {})
    }
    document.addEventListener('play', send, true)
    document.addEventListener('pause', send, true)
    document.addEventListener('ended', send, true)
    setInterval(send, 20000)
    return
  }

  let last = ''
  function report() {
    const i = info()
    const key = JSON.stringify(i)
    if (key === last) return
    last = key
    chrome.runtime.sendMessage({ type: 'page', info: i }).catch(() => {})
  }

  report()
  document.addEventListener('play', report, true)
  document.addEventListener('pause', report, true)
  new MutationObserver(report).observe(document.querySelector('title') ?? document.head, { childList: true, subtree: true, characterData: true })
  setInterval(report, 20000)
  chrome.runtime.onMessage.addListener((msg, _s, reply) => { if (msg.type === 'course-info') reply(info(true)) })
})()
