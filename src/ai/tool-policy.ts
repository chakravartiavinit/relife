import { addDays, daysBetween } from '@/core/time'

export const MAX_HISTORY_DAYS = 90
const nonMedicineScheduleKinds = ['routine', 'subscription', 'bill', 'renewal'] as const
const scheduleKinds = [...nonMedicineScheduleKinds, 'medicine'] as const

/** True only for an actual Gregorian calendar date, not merely a YYYY-MM-DD-shaped string. */
export function isLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

type DateRange = { from?: string; to?: string }

/** Resolves an inclusive local-date range without allowing future or overlong history reads. */
export function resolveHistoryRange(today: string, input: DateRange, defaultFrom: string) {
  const from = input.from ?? defaultFrom
  const to = input.to ?? today
  if (!isLocalDate(from) || !isLocalDate(to)) return { error: 'Dates must be real YYYY-MM-DD calendar dates.' } as const
  if (from > to) return { error: 'The start date must be on or before the end date.' } as const
  if (to > today) return { error: 'Date ranges cannot include future dates.' } as const
  if (daysBetween(from, to) >= MAX_HISTORY_DAYS) return { error: `Date ranges are limited to ${MAX_HISTORY_DAYS} days.` } as const
  return { from, to } as const
}

/** A medicine tool is available only when the user explicitly raised medication. */
export function hasExplicitMedicineIntent(question: string) {
  return /\b(medicine|medication|medications|meds?|prescription|pill|pills|tablet|tablets|dosage|dose|vitamin|supplement)\b/i.test(question)
}

export function allowedScheduleKinds(allowMedicine: boolean) {
  return allowMedicine ? scheduleKinds : nonMedicineScheduleKinds
}

/** Medicine proposals may create a reminder only; generic quantity fields could encode a dose. */
export function canProposeSchedule(kind: string, target?: number, unit?: string) {
  return kind !== 'medicine' || (target === undefined && unit === undefined)
}

export function defaultMetricFrom(today: string) {
  return addDays(today, -27)
}
