// Apple Health export.xml → one summary per local day. Pure: the caller streams the XML and hands every <Record>'s
// attributes to `HealthDays.add`. Metric keys are the ones iPhone Shortcuts use (`parsers/shortcuts.ts` METRICS), so
// a day never sums two Apple sources.

type Rule =
  | { metric: string; how: 'sum'; unit: Record<string, number> }
  | { metric: string; how: 'last'; unit: Record<string, number> }

const RULES: Record<string, Rule> = {
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', how: 'sum', unit: { count: 1 } },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { metric: 'distance', how: 'sum', unit: { km: 1, mi: 1.609344, m: 0.001 } },
  HKQuantityTypeIdentifierFlightsClimbed: { metric: 'flights', how: 'sum', unit: { count: 1 } },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: 'active_energy', how: 'sum', unit: { kcal: 1, Cal: 1, kJ: 1 / 4.184 } },
  HKQuantityTypeIdentifierBodyMass: { metric: 'weight', how: 'last', unit: { kg: 1, lb: 0.45359237, g: 0.001 } },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'resting_hr', how: 'last', unit: { 'count/min': 1 } },
}
const MINDFUL = 'HKCategoryTypeIdentifierMindfulSession'
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis'

/** Every record type this import reads. The caller can skip all other elements without parsing them. */
export const HEALTH_TYPES = new Set([...Object.keys(RULES), MINDFUL, SLEEP])

/** "2024-01-01 08:00:00 +0530" → epoch milliseconds (NaN when it doesn't look like that). */
export function healthTime(s: string | undefined): number {
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-])(\d\d):?(\d\d)$/.exec(s ?? '')
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`) : NaN
}

export type HealthDay = { metrics: Record<string, number>; sleepHours?: number }

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

export class HealthDays {
  private sums = new Map<string, number>() // date|metric|source
  private lasts = new Map<string, { at: number; value: number }>() // date|metric
  private sleep = new Map<string, [number, number][]>() // date (of the end) → intervals
  private mindful = new Map<string, number>() // date → minutes
  records = 0

  /** `dateOf` turns an instant into the user's local date (YYYY-MM-DD). */
  constructor(private dateOf: (ms: number) => string) {}

  add(a: Record<string, string>) {
    const type = a.type
    const start = healthTime(a.startDate)
    const end = healthTime(a.endDate)
    if (Number.isNaN(start) || Number.isNaN(end)) return
    if (type === SLEEP) {
      if (!/Asleep/.test(a.value ?? '') || end <= start) return // InBed and Awake are not sleep
      const day = this.dateOf(end)
      const list = this.sleep.get(day) ?? []
      list.push([start, end]); this.sleep.set(day, list)
      this.records++
      return
    }
    if (type === MINDFUL) {
      const day = this.dateOf(start)
      this.mindful.set(day, (this.mindful.get(day) ?? 0) + Math.max(0, end - start) / 60_000)
      this.records++
      return
    }
    const rule = RULES[type]
    if (!rule) return
    const factor = rule.unit[a.unit ?? ''] ?? (Object.keys(rule.unit).length === 1 ? Object.values(rule.unit)[0] : undefined)
    const raw = Number(a.value)
    if (factor === undefined || !Number.isFinite(raw)) return
    const value = raw * factor
    this.records++
    if (rule.how === 'sum') {
      const key = `${this.dateOf(start)}|${rule.metric}|${a.sourceName ?? ''}`
      this.sums.set(key, (this.sums.get(key) ?? 0) + value)
    } else {
      const key = `${this.dateOf(end)}|${rule.metric}`
      const prev = this.lasts.get(key)
      if (!prev || end >= prev.at) this.lasts.set(key, { at: end, value })
    }
  }

  /** The days read so far. Sum metrics take the max across sources (iPhone and Watch both count steps). */
  days(): Map<string, HealthDay> {
    const out = new Map<string, HealthDay>()
    const day = (d: string) => { let x = out.get(d); if (!x) out.set(d, (x = { metrics: {} })); return x }
    for (const [key, v] of this.sums) {
      const [date, metric] = key.split('|')
      const d = day(date)
      d.metrics[metric] = Math.max(d.metrics[metric] ?? 0, v)
    }
    for (const [key, { value }] of this.lasts) {
      const [date, metric] = key.split('|')
      day(date).metrics[metric] = value
    }
    for (const [date, minutes] of this.mindful) day(date).metrics.mindful_minutes = minutes
    for (const [date, list] of this.sleep) day(date).sleepHours = round(unionMs(list) / 3_600_000)
    for (const d of out.values()) {
      for (const k of Object.keys(d.metrics)) d.metrics[k] = round(d.metrics[k], k === 'steps' || k === 'flights' ? 0 : 2)
      if (d.sleepHours === 0) delete d.sleepHours
      for (const k of Object.keys(d.metrics)) if (d.metrics[k] === 0 && k !== 'weight') delete d.metrics[k]
    }
    for (const [date, d] of out) if (!Object.keys(d.metrics).length && d.sleepHours === undefined) out.delete(date)
    return out
  }
}

/** Total length of the union of intervals: two devices recording the same night count once. */
export function unionMs(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let curS = -Infinity, curE = -Infinity
  for (const [s, e] of sorted) {
    if (s > curE) { if (curE > curS) total += curE - curS; curS = s; curE = e }
    else if (e > curE) curE = e
  }
  if (curE > curS) total += curE - curS
  return total
}
