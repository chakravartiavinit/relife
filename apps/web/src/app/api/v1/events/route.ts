import type { Event } from '@relife/contract'
import { authenticate, denied } from '@/core/auth/request'
import { subscribe } from '@/core/auth/events'
import { dataVersionFor } from '@/core/data-version'

// One Server-Sent Events stream per client (cookie or bearer): `hello`, `data` when the data version changes, `pairing`,
// `device.revoked` and a `ping` every 25 s. Pairing and revoke events come over Postgres LISTEN, so they reach the right
// stream on any web instance. A proxy that buffers is why dashboards keep their 20 s poll as a fallback.

export async function GET(req: Request) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a)
  const enc = new TextEncoder()
  let stop: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      let closed = false
      const send = (e: Event) => {
        if (closed) return
        try { c.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)) } catch { close() }
        if (e.type === 'device.revoked' && e.id === a.device.id) close() // that client signs out; its stream ends
      }
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(ping); unsub?.(); try { c.close() } catch { /* already closed */ }
      }
      stop = close
      const ping = setInterval(() => send({ type: 'ping' }), 25_000)
      let unsub: (() => void) | undefined
      req.signal.addEventListener('abort', close)
      send({ type: 'hello', version: (await dataVersionFor(a.user.id)) ?? '' })
      unsub = await subscribe({ userId: a.user.id, deviceId: a.device.id, send })
      if (closed) unsub()
    },
    cancel() { stop?.() },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}
