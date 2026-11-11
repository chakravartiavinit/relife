import { addDays, daysBetween } from '@/core/time'

export const MAX_HISTORY_DAYS = 90
const nonMedicineScheduleKinds = ['routine', 'subscription', 'bill', 'renewal'] as const
const medicationOrDose = /\b(?:medicine|medications?|meds?|prescriptions?|pills?|tablets?|capsules?|dosages?|doses?|vitamins?|supplements?|melatonin|insulin|syrup)(?=\b|\d)|\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|iu)\b|^\s*(?:mg|mcg|µg|iu)\s*$/i

/** True only for an actual Gregorian calendar date, not merely a YYYY-MM-DD-shaped string. */
export function isLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

type DateRange = { from?: string; to?: string }

/** Resolves an inclusive local-date range without allowing future or overlong history reads. */
export function resolveHistoryRange(today: string, input: DateRange, defaultFrom: (to: string) => string) {
  const to = input.to ?? today
  const from = input.from ?? defaultFrom(to)
  if (!isLocalDate(from) || !isLocalDate(to)) return { error: 'Dates must be real YYYY-MM-DD calendar dates.' } as const
  if (from > to) return { error: 'The start date must be on or before the end date.' } as const
  if (to > today) return { error: 'Date ranges cannot include future dates.' } as const
  if (daysBetween(from, to) >= MAX_HISTORY_DAYS) return { error: `Date ranges are limited to ${MAX_HISTORY_DAYS} days.` } as const
  return { from, to } as const
}

export function allowedScheduleKinds() {
  return nonMedicineScheduleKinds
}

/** AI schedule suggestions never create medicine reminders or encode medication/dosage in another kind. */
export function isSafeAiScheduleProposal(kind: string, ...text: (string | undefined)[]) {
  return nonMedicineScheduleKinds.some((allowed) => allowed === kind) && !text.some((value) => value != null && medicationOrDose.test(value))
}

export function defaultMetricFrom(today: string) {
  return addDays(today, -27)
}
