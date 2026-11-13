import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from './paths'
import { fetchPublic } from './safe-fetch'

// Cover pictures for library items (courses, shows), copied once from the page's og:image into data/library
// so ReLife never loads them from the web again. data/ is never committed.

const DIR = dataDir('library')
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

/** Download a picture for an item. Returns the saved file name, or null if it isn't a usable image. The address comes from a web page, so it is fetched with fetchPublic (public addresses only, 3 MB at most). */
export async function saveCover(itemId: string, url: string) {
  try {
    const res = await fetchPublic(url, { maxBytes: 3_000_000, headers: { 'User-Agent': 'Mozilla/5.0 ReLife' } })
    const ext = TYPES[String(res?.headers['content-type'] ?? '').split(';')[0].trim()]
    if (!res || res.status < 200 || res.status > 299 || !ext) return null
    await mkdir(DIR, { recursive: true })
    const name = `${itemId}.${ext}`
    await writeFile(join(/* turbopackIgnore: true */ DIR, name), res.body)
    return name
  } catch {
    return null
  }
}

export async function readCover(name: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(name)) return null
  const buf = await readFile(join(/* turbopackIgnore: true */ DIR, name)).catch(() => null)
  const ext = name.split('.').pop()!
  return buf ? { buf, type: Object.entries(TYPES).find(([, e]) => e === ext)![0] } : null
}
