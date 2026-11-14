# Share card fonts

Static, Latin-only TTF instances of Inter (400, 600), Outfit (800) and JetBrains Mono (600), cut from the variable fonts
in google/fonts with `fontTools.varLib.instancer` and `fontTools.subset`. Satori (next/og) needs static ttf, otf or woff
files and cannot read variable fonts or woff2. All three are under the SIL Open Font License (`OFL.txt`).

Names in other scripts have no glyphs here, so the name field on a card is off by default. Add a Noto subset in
`src/ui/share/fonts.ts` (the one loader) to cover more scripts.
