import { Output } from 'ai'
import { z } from 'zod'
import { CATEGORIES, type Category } from '@/db/schema'
import { WEEKDAYS } from '@/domain/recurrence'
import type { Template } from '@/core/onboarding'
import { aiEnabled, model } from './models'
import { generate } from './run'

// Setup's routines step: the user describes their life in their own words and the model proposes a
// small, realistic set of routines that fit it. Output is clamped to shapes the scheduler understands.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const schema = z.object({
  routines: z.array(z.object({
    name: z.string().describe('short imperative name, 2–5 words, e.g. "Evening walk"'),
    area: z.enum(CATEGORIES).describe('life area it belongs to'),
    kind: z.enum(['routine', 'medicine']).describe('medicine only for pills or supplements'),
    days: z.array(z.enum(WEEKDAYS)).describe('weekdays it happens on; all seven for every day'),
    times: z.array(z.string()).describe('one or more 24h HH:MM times'),
    note: z.string().optional().describe('one short detail, e.g. "10 minutes" or "Three lines"'),
    dose: z.string().optional().describe('for medicine only, e.g. "1 capsule"'),
    why: z.string().describe('one short sentence tying it to what the user said'),
  })),
})

export type SuggestedRoutine = Template & { why: string }

export async function suggestRoutines(input: {
  prompt: string; areas: Category[]; focus?: Category; goals?: string; existing: string[]
}): Promise<SuggestedRoutine[]> {
  if (!aiEnabled('plan')) throw new Error('No AI model connected')
  const res = await generate('plan', 'plan.onboarding-routines', {
    model: model('plan'),
    output: Output.object({ schema }),
    system: [
      'You design starter routines for a habit tracker that reminds the user on their phone and rewards streaks.',
      'Propose 4 to 7 routines that fit the user\'s own description: their schedule, work, wake and sleep times, and what they want to change.',
      'Prefer small, specific, doable habits over ambitious ones. Use times that fit the day they described. Never schedule during work hours they mention unless asked.',
      `Only use these areas: ${input.areas.join(', ')}.${input.focus ? ` Lean towards ${input.focus}.` : ''}`,
      input.existing.length ? `They already have: ${input.existing.join(', ')}. Don't repeat those.` : '',
      'Use medicine only for pills or supplements they mention. Write the reason in plain, warm language, addressed to them.',
    ].filter(Boolean).join(' '),
    prompt: [`About me: ${input.prompt.trim()}`, input.goals?.trim() ? `My goals: ${input.goals.trim()}` : ''].filter(Boolean).join('\n'),
  })
  return toTemplates(res.output?.routines ?? [], input.areas, input.existing)
}

type Raw = z.infer<typeof schema>['routines'][number]

/** Keeps only what the scheduler can run: valid times, picked areas, no repeats; daily when all 7 days. */
export function toTemplates(raw: Raw[], areas: Category[], existing: string[]): SuggestedRoutine[] {
  const seen = new Set(existing.map((n) => n.toLowerCase()))
  return raw.flatMap((r, i) => {
    const times = [...new Set(r.times.filter((t) => TIME.test(t)))].sort().slice(0, 6)
    const name = r.name.trim().slice(0, 60)
    if (!name || !times.length || seen.has(name.toLowerCase()) || !areas.includes(r.area)) return []
    seen.add(name.toLowerCase())
    const days = [...new Set(r.days)]
    const rule = days.length === 0 || days.length === 7 ? { freq: 'daily' as const, times } : { freq: 'weekly' as const, times, byweekday: days }
    return [{
      id: `ai-${i}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      area: r.area, name, kind: r.kind, rule,
      note: r.note?.trim().slice(0, 60) || undefined,
      dose: r.kind === 'medicine' ? r.dose?.trim().slice(0, 40) || undefined : undefined,
      why: r.why.trim().slice(0, 160),
    }]
  }).slice(0, 8)
}
