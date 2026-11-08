// A picture for every hobby, from its name: Microsoft's Fluent 3D emoji (MIT), saved in public/hobbies so
// they work offline. First match wins; anything unknown gets sparkles.

const RULES: [RegExp, string][] = [
  [/guitar|ukulele|bass\b/i, 'guitar'],
  [/piano|keyboard|synth/i, 'piano'],
  [/violin|cello|viola/i, 'violin'],
  [/drum|percussion|tabla/i, 'drums'],
  [/sax/i, 'saxophone'],
  [/trumpet|brass|flute/i, 'trumpet'],
  [/sing|vocal|karaoke/i, 'singing'],
  [/music|dj|produc/i, 'music'],
  [/paint|watercolou?r|acrylic/i, 'paintbrush'],
  [/draw|sketch|art\b|illustrat|calligraph|doodl/i, 'palette'],
  [/chess/i, 'chess'],
  [/bak(e|ing)|pastry|dessert/i, 'baking'],
  [/cook|chef|kitchen|recipe/i, 'cooking'],
  [/photo|camera/i, 'camera'],
  [/film|video|movie|edit|youtube/i, 'film'],
  [/writ|journal|poem|poetry|blog|story/i, 'writing'],
  [/read|book|novel|manga/i, 'reading'],
  [/board game|d&d|dungeons|dice|tabletop/i, 'dice'],
  [/game|gaming|play ?station|xbox|nintendo/i, 'gaming'],
  [/puzzle|rubik|sudoku|crossword/i, 'puzzle'],
  [/garden|plant|bonsai/i, 'gardening'],
  [/run|jog|marathon/i, 'running'],
  [/hik|trek|climb/i, 'hiking'],
  [/camp/i, 'camping'],
  [/cycl|bike|biking/i, 'cycling'],
  [/football|soccer|futsal/i, 'football'],
  [/basketball/i, 'basketball'],
  [/badminton/i, 'badminton'],
  [/tennis|squash|pickleball/i, 'tennis'],
  [/cricket/i, 'cricket'],
  [/swim/i, 'swimming'],
  [/fish/i, 'fishing'],
  [/skate/i, 'skateboard'],
  [/kite/i, 'kite'],
  [/danc|ballet|salsa/i, 'dance'],
  [/yoga|meditat/i, 'yoga'],
  [/knit|crochet|yarn/i, 'knitting'],
  [/sew|embroider|quilt/i, 'sewing'],
  [/potter|ceramic|clay/i, 'pottery'],
  [/coffee|latte|brew/i, 'coffee'],
  [/language|spanish|french|japanese|german|duolingo/i, 'language'],
  [/travel|explor/i, 'travel'],
  [/cod(e|ing)|program|side project/i, 'coding'],
]

export function hobbyArt(name: string) {
  const hit = RULES.find(([re]) => re.test(name))?.[1] ?? 'sparkles'
  return `/hobbies/${hit}.png`
}
