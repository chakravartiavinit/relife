// Sends a file to /api/import/<id> in order, in chunks, so a big export never sits in memory or hits the proxy's body limit.
// A 409 says where the server is (`expected`): the next chunk starts there, which is also how a retry after a lost
// response continues without repeating bytes.

export type UploadResult = { ok: true } | { ok: false; error: string; aborted?: boolean }

export async function uploadFile(file: File, id: string, chunkBytes: number, onProgress: (sent: number) => void, signal: AbortSignal): Promise<UploadResult> {
  let offset = 0
  let failures = 0
  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunkBytes)
    try {
      const res = await fetch(`/api/import/${id}?offset=${offset}`, { method: 'PUT', body: file.slice(offset, end), signal, headers: { 'content-type': 'application/octet-stream' } })
      if (res.ok) { offset = end; failures = 0; onProgress(offset); continue }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string }; expected?: number } | null
      if (res.status === 409 && typeof body?.expected === 'number' && body.expected !== offset && body.expected <= file.size) { offset = body.expected; onProgress(offset); continue }
      if (res.status >= 500 && ++failures < 3) { await new Promise((r) => setTimeout(r, 500 * failures)); continue }
      return { ok: false, error: body?.error?.message ?? `The upload stopped (${res.status}). Try again.` }
    } catch (e) {
      if (signal.aborted) return { ok: false, error: 'Cancelled', aborted: true }
      if (++failures < 3) { await new Promise((r) => setTimeout(r, 500 * failures)); continue }
      return { ok: false, error: e instanceof Error && e.message ? 'The connection dropped. Check it and try again.' : 'The upload stopped. Try again.' }
    }
  }
  return { ok: true }
}
