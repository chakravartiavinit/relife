// Timezone helpers. Every "per day" value is keyed by the user's local date (YYYY-MM-DD),
// so streaks never break at midnight UTC.

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Local wall-clock fields of `d` in `tz`, encoded as a UTC Date ("floating" time). */
export function utcToWall(d: Date, tz: string): Date {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]))
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, d.getUTCMilliseconds()))
}

/** Inverse of utcToWall: a floating wall time in `tz` to the real instant. Handles DST. */
export function wallToUtc(wall: Date, tz: string): Date {
  let guess = wall.getTime()
  for (let i = 0; i < 2; i++) {
    const offset = utcToWall(new Date(guess), tz).getTime() - guess
    guess = wall.getTime() - offset
  }
  return new Date(guess)
}

export function localDate(d: Date, tz: string): string {
  return utcToWall(d, tz).toISOString().slice(0, 10)
}

/** [start, end) of the local day containing `d`, as real instants. */
export function localDayRange(day: string, tz: string): [Date, Date] {
  const start = wallToUtc(new Date(`${day}T00:00:00Z`), tz)
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return [start, wallToUtc(next, tz)]
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** "08:30" in the user's timezone. Same output on server and client, so no hydration mismatch. */
export function formatTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

/** "Fri, 6 Nov" for a local YYYY-MM-DD. */
export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

export function localHour(d: Date, tz: string) {
  return utcToWall(d, tz).getUTCHours()
}
