// A 3D picture for every routine, from its name: Microsoft's Fluent 3D emoji (MIT) in public/routines.
// First match wins; otherwise the area's own.
const RULES: [RegExp, string][] = [
  [/water|hydrat/i, 'water'],
  [/mood/i, 'mood'],
  [/energy/i, 'energy'],
  [/weight|body fat|bmi/i, 'weight'],
  // Connector metrics (Oura, WHOOP, Strava): recovery and readiness are the heart's, strain the energy's, active minutes a run's.
  [/recovery|readiness|hrv|resting|heart/i, 'heart'],
  [/strain|stress/i, 'energy'],
  [/active minutes|activity/i, 'run'],
  // "Reviews" (the GitHub tracker) and code reviews, but not "Review budget".
  [/commit|pull request|^reviews?$|code review/i, 'code'],
  [/skin|face|serum|sunscreen|mask|moistur/i, 'skin'],
  [/yoga|stretch/i, 'yoga'],
  [/run\b|running|jog/i, 'run'],
  [/gym|workout|lift|exercise|push.?ups?|pull.?ups?|squat/i, 'gym'],
  [/walk|steps/i, 'walk'],
  [/read|book|pages/i, 'read'],
  [/journal|diary|write/i, 'journal'],
  [/meditat|breath|mindful/i, 'yoga'],
  [/vitamin|omega|pill|tablet|capsule|medicine|supplement|creatine/i, 'pill'],
  [/lights out|sleep|bed|wind.?down/i, 'sleep'],
  [/phone|screen/i, 'phone'],
  [/call|parents|mom|dad|family|friend/i, 'call'],
  [/budget|money|spen[dt]|save|invest/i, 'money'],
  [/code|dsa|leetcode|practice coding|program/i, 'code'],
  [/learn|study|course|language|duolingo/i, 'learn'],
  [/shower|bath/i, 'shower'],
  [/eat|meal|salad|veg|fruit|protein/i, 'salad'],
  [/music|guitar|piano|sing|drum|violin|ukulele/i, 'music'],
  [/draw|paint|sketch|art\b|watercolou?r/i, 'art'],
  [/chess/i, 'chess'],
  [/photo|camera/i, 'camera'],
  [/game|gaming/i, 'game'],
  [/knit|craft|sew|crochet/i, 'yarn'],
  [/cook|bake|baking/i, 'cook'],
  [/morning|sunrise|wake/i, 'sunrise'],
  [/night|evening/i, 'moon'],
  [/plant|garden/i, 'plant'],
  [/floss|teeth|brush/i, 'teeth'],
]

const AREA: Record<string, string> = {
  health: 'heart', mind: 'brain', skills: 'learn',
  wealth: 'money', hobbies: 'art', relationships: 'people',
}

function pick(name: string, kind: string, area: string): string {
  if (kind === 'medicine') return 'pill'
  if (kind === 'subscription' || kind === 'bill' || kind === 'renewal') return 'card'
  return RULES.find(([re]) => re.test(name))?.[1] ?? AREA[area] ?? 'check'
}

/** 3D picture for a routine (a path under /routines), for lists where the routine is the subject. */
export function routineArt(name: string, kind: string, area: string): string {
  return `/routines/${pick(name, kind, area)}.png`
}
