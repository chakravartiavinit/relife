import { z } from 'zod'
import { CATEGORIES } from '@/db/schema'

// The goal form's FormData, parsed for the saveGoal server action. Kept outside actions.ts so it can be tested.

const optionalUuid = z.string().uuid().optional().or(z.literal('').transform(() => undefined))
const optionalNum = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().finite().nullable())
const goalForm = z.object({
  id: optionalUuid,
  version: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
  draftInsightId: optionalUuid,
  title: z.string().trim().max(120),
  reason: z.string().trim().max(500),
  area: z.enum(CATEGORIES),
  measureKind: z.enum(['tracker', 'check_in']),
  trackerId: optionalUuid,
  measureName: z.string().trim().max(80).default(''),
  unit: z.string().trim().max(20).default(''),
  direction: z.enum(['increase', 'decrease', 'range']),
  target: optionalNum, rangeLow: optionalNum, rangeHigh: optionalNum,
  baselineMode: z.enum(['recorded', 'manual']).default('manual'),
  baselineValue: optionalNum,
  baselineDate: z.string().default(''),
  baselineHow: z.string().trim().max(200).default(''),
  targetDate: z.string().default(''),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly']),
})

/** The parsed fields and linked actions, or null when a field is invalid. Unknown action keys are dropped. */
export function parseGoalForm(form: FormData) {
  const parsed = goalForm.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== 'actions')))
  if (!parsed.success) return null
  const actions = form.getAll('actions').map(String).flatMap((v) => {
    const [kind, id] = v.split(':')
    return (kind === 'schedule' || kind === 'tracker') && z.string().uuid().safeParse(id).success ? [{ kind: kind as 'schedule' | 'tracker', id }] : []
  })
  return { fields: parsed.data, actions }
}
