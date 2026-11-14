import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// The one loader for the card fonts. Satori needs static ttf, otf or woff: next/font gives no files and cannot read
// variable fonts. Read once per process. They hold Latin only: `cardText` (domain/share-card.ts) drops every other character, so
// nothing needs a fallback font. To cover another script, add its font here and widen `CARD_CHARS` to match (fonts.test.ts checks).
const dir = join(process.cwd(), 'assets/og/fonts')
const load = (file: string) => readFile(join(dir, file))

let cached: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: 'normal' }[]> | undefined

export function cardFonts() {
  cached ??= Promise.all([
    load('Inter-Regular.ttf'), load('Inter-SemiBold.ttf'), load('Outfit-ExtraBold.ttf'), load('JetBrainsMono-SemiBold.ttf'),
  ]).then(([inter4, inter6, outfit, mono]) => {
    const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    return [
      { name: 'Inter', data: ab(inter4), weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: ab(inter6), weight: 600 as const, style: 'normal' as const },
      { name: 'Outfit', data: ab(outfit), weight: 800 as const, style: 'normal' as const },
      // The mono labels (SystemLabel) are 600; Satori matches by name and weight.
      { name: 'JetBrains Mono', data: ab(mono), weight: 600 as const, style: 'normal' as const },
    ]
  })
  cached.catch(() => { cached = undefined })
  return cached
}
