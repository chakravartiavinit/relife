import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Cover pictures for library items (courses, shows), copied once from the page's og:image into data/library
// so ReLife never loads them from the web again. data/ is never committed.

const DIR = join(process.cwd(), 'data', 'library')
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

/** Download a picture for an item. Returns the saved file name, or null if it isn't a usable image. */
export async function saveCover(itemId: string, url: string) {
  if (!/^https:\/\//.test(url)) return null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ReLife' }, signal: AbortSignal.timeout(10_000) })
    const type = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
    const ext = TYPES[type]
    if (!res.ok || !ext) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 3_000_000) return null
    await mkdir(DIR, { recursive: true })
    const name = `${itemId}.${ext}`
    await writeFile(join(DIR, name), buf)
    return name
  } catch {
    return null
  }
}

export async function readCover(name: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(name)) return null
  const buf = await readFile(join(DIR, name)).catch(() => null)
  const ext = name.split('.').pop()!
  return buf ? { buf, type: Object.entries(TYPES).find(([, e]) => e === ext)![0] } : null
}
