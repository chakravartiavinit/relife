import { Bath, BedDouble, BookOpen, Brain, Camera, ChefHat, Code, CreditCard, Crown, Droplets, Dumbbell, Footprints, Gamepad2, GitCommitHorizontal, GlassWater, GraduationCap, HeartPulse, Languages, Leaf, Moon, Music, NotebookPen, Palette, Phone, PiggyBank, Pill, Salad, Scale, Scissors, Smartphone, Smile, Sparkles, Sun, Users, Wallet, Wind, Zap, type LucideIcon } from 'lucide-react'

// A picture for every routine, from its name: a line icon (card headers, empty states) and a 3D picture
// (lists of routines), Microsoft's Fluent 3D emoji (MIT) in public/routines. First match wins; otherwise
// the area's own.
const RULES: [RegExp, LucideIcon, string][] = [
  [/water|hydrat/i, GlassWater, 'water'],
  [/mood/i, Smile, 'mood'],
  [/energy/i, Zap, 'energy'],
  [/weight/i, Scale, 'weight'],
  [/commit|pull request|review/i, GitCommitHorizontal, 'code'],
  [/skin|face|serum|sunscreen|mask|moistur/i, Sparkles, 'skin'],
  [/yoga|stretch/i, Dumbbell, 'yoga'],
  [/run\b|running|jog/i, Footprints, 'run'],
  [/gym|workout|lift|exercise|push.?ups?|pull.?ups?|squat/i, Dumbbell, 'gym'],
  [/walk|steps/i, Footprints, 'walk'],
  [/read|book|pages/i, BookOpen, 'read'],
  [/journal|diary|write/i, NotebookPen, 'journal'],
  [/meditat|breath|mindful/i, Wind, 'yoga'],
  [/vitamin|omega|pill|tablet|capsule|medicine|supplement|creatine/i, Pill, 'pill'],
  [/lights out|sleep|bed/i, BedDouble, 'sleep'],
  [/phone|screen/i, Smartphone, 'phone'],
  [/call|parents|mom|dad|family|friend/i, Phone, 'call'],
  [/budget|money|spend|save|invest/i, PiggyBank, 'money'],
  [/code|dsa|leetcode|practice coding|program/i, Code, 'code'],
  [/learn|study|course|language|duolingo/i, Languages, 'learn'],
  [/shower|bath/i, Bath, 'shower'],
  [/eat|meal|salad|veg|fruit|protein/i, Salad, 'salad'],
  [/music|guitar|piano|sing|drum|violin|ukulele/i, Music, 'music'],
  [/draw|paint|sketch|art\b|watercolou?r/i, Palette, 'art'],
  [/chess/i, Crown, 'chess'],
  [/photo|camera/i, Camera, 'camera'],
  [/game|gaming/i, Gamepad2, 'game'],
  [/knit|craft|sew|crochet/i, Scissors, 'yarn'],
  [/cook|bake|baking/i, ChefHat, 'cook'],
  [/morning|sunrise|wake/i, Sun, 'sunrise'],
  [/night|evening/i, Moon, 'moon'],
  [/plant|garden/i, Leaf, 'plant'],
  [/floss|teeth|brush/i, Droplets, 'teeth'],
]

const AREA: Record<string, [LucideIcon, string]> = {
  health: [HeartPulse, 'heart'], mind: [Brain, 'brain'], skills: [GraduationCap, 'learn'],
  wealth: [Wallet, 'money'], hobbies: [Palette, 'art'], relationships: [Users, 'people'],
}

function pick(name: string, kind: string, area: string): [LucideIcon, string] {
  if (kind === 'medicine') return [Pill, 'pill']
  if (kind === 'subscription' || kind === 'bill' || kind === 'renewal') return [CreditCard, 'card']
  const r = RULES.find(([re]) => re.test(name))
  return r ? [r[1], r[2]] : AREA[area] ?? [Sparkles, 'sparkles']
}

/** Line icon for a routine: card headers, empty states, compact spots. */
export function routineIcon(name: string, kind: string, area: string): LucideIcon {
  return pick(name, kind, area)[0]
}

/** 3D picture for a routine (a path under /routines), for lists where the routine is the subject. */
export function routineArt(name: string, kind: string, area: string): string {
  return `/routines/${pick(name, kind, area)[1]}.png`
}
