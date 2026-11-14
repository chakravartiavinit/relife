import { readFile } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import yauzl from 'yauzl'
import { detectDelimiter, parseCsv, stripBom } from '@/domain/csv'

// File readers shared by the import kinds: a CSV read whole (capped at 25 MB by createImport), and zip entries read
// as streams so a 2 GB export never sits in memory.

/** UTF-8, or Windows-1252 when the bytes are not valid UTF-8 (some banks still export that). */
export function decodeText(buf: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

export async function readCsvFile(file: string, delimiter?: string) {
  const text = stripBom(decodeText(await readFile(file)))
  const d = delimiter || detectDelimiter(text)
  return { delimiter: d, rows: parseCsv(text, d) }
}

export type ZipEntry = yauzl.Entry

export function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: true }, (err, zip) => (err || !zip ? reject(err ?? new Error('Not a zip file')) : resolve(zip)))
  })
}

/** Every file entry of a zip, without reading any of them. Directories are left out. */
export async function listZip(file: string): Promise<ZipEntry[]> {
  const zip = await openZip(file)
  return new Promise((resolve, reject) => {
    const out: ZipEntry[] = []
    zip.on('entry', (e: ZipEntry) => { if (!e.fileName.endsWith('/')) out.push(e); zip.readEntry() })
    zip.on('end', () => { zip.close(); resolve(out) })
    zip.on('error', (err) => { zip.close(); reject(err) })
    zip.readEntry()
  })
}

/** Run `fn` on one entry's inflated stream (found by name through `list`), then close the zip. */
export async function withEntry<T>(file: string, entry: ZipEntry, fn: (stream: Readable) => Promise<T>): Promise<T> {
  const zip = await openZip(file)
  try {
    return await new Promise<T>((resolve, reject) => {
      zip.on('entry', (e: ZipEntry) => {
        if (e.fileName !== entry.fileName) return zip.readEntry()
        zip.openReadStream(e, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error('Cannot read the zip entry'))
          fn(stream).then(resolve, reject)
        })
      })
      zip.on('end', () => reject(new Error(`${entry.fileName} is not in the zip`)))
      zip.on('error', reject)
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
}

/** One small zip entry read whole. Refuses an entry over `maxBytes` (a bomb or the wrong file). */
export async function readEntryText(file: string, entry: ZipEntry, maxBytes = 300 * 1024 * 1024): Promise<string> {
  if (entry.uncompressedSize > maxBytes) throw new Error(`${entry.fileName} is too large to read (${Math.round(entry.uncompressedSize / 1e6)} MB)`)
  return withEntry(file, entry, async (stream) => {
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    return stripBom(decodeText(Buffer.concat(chunks)))
  })
}

/** Several small entries read whole in ONE pass over the zip (opening it once per entry rescans the directory each time). */
export async function readEntriesText(file: string, entries: ZipEntry[], maxBytes = 300 * 1024 * 1024): Promise<Map<string, string>> {
  const big = entries.find((e) => e.uncompressedSize > maxBytes)
  if (big) throw new Error(`${big.fileName} is too large to read (${Math.round(big.uncompressedSize / 1e6)} MB)`)
  const want = new Set(entries.map((e) => e.fileName))
  const out = new Map<string, string>()
  if (!want.size) return out
  const zip = await openZip(file)
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (e: ZipEntry) => {
        if (!want.has(e.fileName)) return zip.readEntry()
        zip.openReadStream(e, async (err, stream) => {
          if (err || !stream) return reject(err ?? new Error('Cannot read the zip entry'))
          try {
            const chunks: Buffer[] = []
            for await (const c of stream) chunks.push(c as Buffer)
            out.set(e.fileName, stripBom(decodeText(Buffer.concat(chunks))))
            if (out.size === want.size) resolve()
            else zip.readEntry()
          } catch (x) { reject(x) }
        })
      })
      zip.on('end', () => resolve())
      zip.on('error', reject)
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
  return out
}
