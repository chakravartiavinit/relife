// @ts-check
// The service worker behind web push: it shows each push as a notification, runs a tapped button against the server,
// and keeps the subscription alive. No fetch handler and no caching: it never sits between the page and the server.
// The payload is built by src/domain/push.ts (`toPush`) and sent by src/core/push.ts.

/** @type {any} */
const sw = self

sw.addEventListener('install', () => sw.skipWaiting())
sw.addEventListener('activate', (/** @type {any} */ e) => e.waitUntil(sw.clients.claim()))

/** Show every push. iOS revokes a subscription that receives a push and shows nothing, so this never stays silent. */
sw.addEventListener('push', (/** @type {any} */ event) => {
  /** @type {{ id?: string, tag?: string, title?: string, body?: string, url?: string, renotify?: boolean, actions?: { action: string, title: string, open?: string }[] }} */
  let msg = {}
  try { msg = event.data ? event.data.json() : {} } catch { msg = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(sw.registration.showNotification(msg.title || 'New message', {
    body: msg.body || '',
    tag: msg.tag || msg.id,
    renotify: !!msg.renotify,
    icon: '/icon.png',
    badge: '/icon.png',
    actions: (msg.actions || []).map((a) => ({ action: a.action, title: a.title })),
    data: { id: msg.id, tag: msg.tag || msg.id, url: msg.url || '/', actions: msg.actions || [] },
  }))
})

/** Focus a window that is already open and take it to `url`, or open one. */
async function openApp(/** @type {string} */ url) {
  const target = new URL(url || '/', sw.location.origin)
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((/** @type {any} */ c) => new URL(c.url).origin === target.origin)
  if (open) {
    await open.focus()
    if (new URL(open.url).pathname + new URL(open.url).search !== target.pathname + target.search && 'navigate' in open) await open.navigate(target.href).catch(() => {})
    return
  }
  await sw.clients.openWindow(target.href)
}

/** A button runs on the server, then the notification turns into its result for a few seconds. Signed out or offline: open the app instead. */
sw.addEventListener('notificationclick', (/** @type {any} */ event) => {
  const n = event.notification
  const data = n.data || {}
  const action = event.action
  const picked = (data.actions || []).find((/** @type {any} */ a) => a.action === action)
  event.waitUntil((async () => {
    n.close()
    if (!action || picked?.open) return openApp(picked?.open || data.url)
    try {
      const res = await fetch('/api/v1/push/action', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, action }),
      })
      if (!res.ok) return openApp(data.url)
      const r = await res.json()
      await sw.registration.showNotification(r.text || 'Done', { tag: data.tag, silent: true, renotify: false, icon: '/icon.png', badge: '/icon.png', data: { url: r.url || data.url, actions: [] } })
      await new Promise((done) => setTimeout(done, 6000))
      for (const shown of await sw.registration.getNotifications({ tag: data.tag })) shown.close()
    } catch {
      await openApp(data.url)
    }
  })())
})

/** The push service replaced the subscription: subscribe again with the same key and tell the server. */
sw.addEventListener('pushsubscriptionchange', (/** @type {any} */ event) => {
  event.waitUntil((async () => {
    const key = event.oldSubscription?.options?.applicationServerKey
    if (!key) return
    const sub = await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await fetch('/api/v1/push/subscription', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
  })())
})
