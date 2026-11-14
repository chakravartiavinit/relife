# Share card fonts

Static, Latin-only TTF instances of Inter (400, 600), Outfit (800) and JetBrains Mono (600), cut from the variable fonts
in google/fonts with `fontTools.varLib.instancer` and `fontTools.subset`. Satori (next/og) needs static ttf, otf or woff
files and cannot read variable fonts or woff2. All three are under the SIL Open Font License (`OFL.txt`).

These fonts hold Latin only (Basic Latin, Latin-1 and a few punctuation marks and arrows). A card never needs a fallback
font: `cardText` in `src/domain/share-card.ts` drops every other character (emoji, flags, stars, Devanagari or Han names)
from every string on a card, and the renderer (`src/ui/share/render.tsx`, Satori and Resvg directly, not `next/og`)
answers `loadAdditionalAsset` with nothing, so no font or emoji image is ever fetched. A name with no drawable character
is left off the card. `src/ui/share/fonts.test.ts` checks that every allowed character has a glyph in every font here.

To cover another script, add a static subset of its font here, load it in `src/ui/share/fonts.ts`, and widen
`CARD_CHARS` to match.
