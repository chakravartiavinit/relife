// Zips the extension for the Chrome Web Store: npm run pack -w apps/extension  ->  dist/relife-extension-<version>.zip
// Leaves out what the store build doesn't need (tsconfig.json, package.json, AGENTS.md, CLAUDE.md, scripts/, node_modules/, dist/).
// A small zip writer on node:zlib, so the package has no dependency and needs no `zip` binary.
import { deflateRawSync } from 'node:zlib'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['tsconfig.json', 'package.json', 'AGENTS.md', 'CLAUDE.md', 'globals.d.ts', 'scripts', 'node_modules', 'dist'])
const version = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (dir === root && SKIP.has(name)) continue
    if (name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}

const CRC = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// Fixed timestamp (2026-01-01) so the same files always give the same zip.
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const parts = [], central = []
let offset = 0
for (const path of walk(root)) {
  const name = Buffer.from(relative(root, path).split(sep).join('/'))
  const data = readFileSync(path)
  const packed = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
  local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
  parts.push(local, name, packed)
  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(8, 10)
  entry.writeUInt16LE(DOS_TIME, 12); entry.writeUInt16LE(DOS_DATE, 14); entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28)
  entry.writeUInt32LE(offset, 42)
  central.push(entry, name)
  offset += local.length + name.length + packed.length
}
const dirSize = central.reduce((n, b) => n + b.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10)
end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(offset, 16)

mkdirSync(join(root, 'dist'), { recursive: true })
const out = join(root, 'dist', `relife-extension-${version}.zip`)
writeFileSync(out, Buffer.concat([...parts, ...central, end]))
console.log(`${relative(process.cwd(), out)}: ${central.length / 2} files, ${statSync(out).size} bytes`)
