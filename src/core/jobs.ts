import { Cron } from 'croner'
import { hostname } from 'node:os'
import { eq, sql as dsql } from 'drizzle-orm'
import { db, schema, sql } from '@/db'

// The job engine: anything that runs on a schedule or on an event. Jobs are declared in src/jobs; this
// file runs them.
//
//   - One run at a time per job, across the worker and the web app: a run takes a lease in the `jobs`
//     table (locked_until). A run that crashes frees the job when its lease ends.
//   - When a job ran and runs next is stored, so a restart neither re-runs everything nor forgets a
//     daily job whose time passed while the worker was off (it catches up once, within catchUpMinutes).
//   - requestJob() runs a job as soon as possible (a connector was just connected, new data to parse).
//     It wakes the worker at once through Postgres LISTEN/NOTIFY; the 15-second tick is the fallback.

export type Schedule = { cron: string } | { everyMinutes: number }

export type Job = {
  /** Stable id, e.g. 'sync:binance', 'parse', 'ai:daily-nudge'. Also the row in `jobs`. */
  id: string
  schedule: Schedule
  /** Runs the job. Return a short summary for the log and the jobs table. Throw to mark it failed. */
  run: () => Promise<string | void>
  /** Skip while false (e.g. a connector that isn't connected). Checked every tick. */
  enabled?: () => boolean | Promise<boolean>
  /** Lease length. A run that takes longer can be started again by someone else. Default 15. */
  timeoutMinutes?: number
  /** Cron jobs missed while the worker was off run once on start if at most this late. Default 60. */
  catchUpMinutes?: number
  /** After failures, wait failures × interval (up to 6 hours) before trying again. */
  backoff?: boolean
  /** Events that make this job run now, e.g. 'raw.added', 'connector.connected:binance'. */
  on?: string[]
}

type State = typeof schema.jobs.$inferSelect

const CHANNEL = 'relife_jobs'
const HOST = hostname()
const WHO = `${HOST}:${process.pid}`
const MAX_BACKOFF_MS = 6 * 3_600_000
const CONCURRENCY = 4 // ponytail: one global cap; per-kind limits (e.g. browser syncs) if Chrome load hurts

/** When a job should next run, from `from`, given how many runs in a row failed. Pure. */
export function nextRun(job: Job, from: Date, tz: string, failures = 0): Date {
  if ('cron' in job.schedule) return new Cron(job.schedule.cron, { timezone: tz }).nextRun(from) ?? new Date(from.getTime() + 86_400_000)
  const every = job.schedule.everyMinutes * 60_000
  const wait = job.backoff && failures > 0 ? Math.min(every * Math.min(failures, 6), Math.max(every, MAX_BACKOFF_MS)) : every
  return new Date(from.getTime() + wait)
}

/** Whether a job is due now, and where its next run lands if a missed run is skipped. Pure. */
export function due(job: Job, state: Pick<State, 'nextRunAt' | 'requestedAt'> | undefined, now: Date, tz: string): { run: boolean; skipTo?: Date } {
  if (state?.requestedAt) return { run: true }
  // Never seen: interval jobs start now (a new connector syncs at once); cron jobs wait for their time.
  if (!state?.nextRunAt) return 'cron' in job.schedule ? { run: false, skipTo: nextRun(job, now, tz) } : { run: true }
  if (state.nextRunAt > now) return { run: false }
  const late = now.getTime() - state.nextRunAt.getTime()
  if ('cron' in job.schedule && late > (job.catchUpMinutes ?? 60) * 60_000) return { run: false, skipTo: nextRun(job, now, tz) }
  return { run: true }
}

/** Run a job now if nobody else is running it. Returns null when it was already running. */
export async function runJob(job: Job, tz: string): Promise<{ ok: boolean; result: string } | null> {
  await db.insert(schema.jobs).values({ id: job.id }).onConflictDoNothing()
  const started = new Date()
  const [lease] = await db.update(schema.jobs)
    .set({ lockedUntil: new Date(started.getTime() + (job.timeoutMinutes ?? 15) * 60_000), lockedBy: WHO })
    .where(dsql`${schema.jobs.id} = ${job.id} and (${schema.jobs.lockedUntil} is null or ${schema.jobs.lockedUntil} < now())`)
    .returning()
  if (!lease) return null
  let ok = true
  let result = ''
  try {
    result = (await job.run()) ?? 'done'
  } catch (e) {
    ok = false
    result = e instanceof Error ? e.message : String(e)
  }
  const failures = ok ? 0 : lease.failures + 1
  await db.update(schema.jobs).set({
    lockedUntil: null, lockedBy: null, lastOk: ok, lastResult: result.slice(0, 500), failures,
    nextRunAt: nextRun(job, started, tz, failures),
    // A request that arrived while running stays, so the job runs once more with what came in meanwhile.
    requestedAt: dsql`case when ${schema.jobs.requestedAt} > ${started.toISOString()}::timestamptz then ${schema.jobs.requestedAt} else null end`,
  }).where(eq(schema.jobs.id, job.id))
  return { ok, result }
}

/** Ask for a job to run as soon as possible. Safe to call from the web app; the worker picks it up. */
export async function requestJob(id: string) {
  await db.insert(schema.jobs).values({ id, requestedAt: new Date() })
    .onConflictDoUpdate({ target: schema.jobs.id, set: { requestedAt: new Date() } })
  await sql.notify(CHANNEL, id).catch(() => {}) // wake the worker now; the tick covers a missed notice
}

/** Something happened: run every job listening for it. */
export async function emitEvent(event: string, jobs: Job[]) {
  for (const j of jobs) if (j.on?.includes(event)) await requestJob(j.id)
}

/** Leases held by processes on this machine that no longer exist (killed, crashed, reloaded): free them. */
async function releaseOrphans() {
  const held = await db.select({ id: schema.jobs.id, by: schema.jobs.lockedBy }).from(schema.jobs)
    .where(dsql`${schema.jobs.lockedUntil} > now() and ${schema.jobs.lockedBy} like ${HOST + ':%'}`)
  const dead = held.filter(({ by }) => {
    const pid = Number(by?.slice(HOST.length + 1))
    if (!pid || pid === process.pid) return false
    try { process.kill(pid, 0); return false } catch (e) { return (e as NodeJS.ErrnoException).code === 'ESRCH' }
  })
  for (const { id, by } of dead) {
    await db.update(schema.jobs).set({ lockedUntil: null, lockedBy: null }).where(dsql`${schema.jobs.id} = ${id} and ${schema.jobs.lockedBy} = ${by}`)
  }
}

/**
 * The scheduler: every 15 seconds (and whenever a request arrives) start each job that's due, at most
 * CONCURRENCY at a time. Jobs run in the background, so a long sync never holds up the others.
 */
export function startScheduler(jobs: Job[], tz: string, log = console.log) {
  const running = new Set<string>()
  let ticking = false
  let stopped = false
  const tick = async () => {
    if (ticking || stopped) return
    ticking = true
    try {
      await releaseOrphans()
      const states = new Map((await db.select().from(schema.jobs)).map((s) => [s.id, s]))
      const now = new Date()
      for (const job of jobs) {
        if (running.size >= CONCURRENCY) break
        if (running.has(job.id)) continue
        const state = states.get(job.id)
        const d = due(job, state, now, tz)
        if (d.skipTo) await db.insert(schema.jobs).values({ id: job.id, nextRunAt: d.skipTo }).onConflictDoUpdate({ target: schema.jobs.id, set: { nextRunAt: d.skipTo } })
        if (!d.run || state?.lockedUntil && state.lockedUntil > now) continue
        if (job.enabled && !(await job.enabled())) {
          if (state?.requestedAt) await db.update(schema.jobs).set({ requestedAt: null }).where(eq(schema.jobs.id, job.id))
          continue
        }
        running.add(job.id)
        void runJob(job, tz)
          .then((r) => { if (r && (!r.ok || r.result !== 'done')) log(`[job] ${job.id}: ${r.ok ? r.result : `failed: ${r.result}`}`) })
          .catch((e) => log(`[job] ${job.id}: ${e instanceof Error ? e.message : e}`))
          .finally(() => { running.delete(job.id); void tick() })
      }
    } catch (e) {
      log(`[job] scheduler: ${e instanceof Error ? e.message : e}`)
    } finally {
      ticking = false
    }
  }
  const timer = setInterval(() => void tick(), 15_000)
  const listening = sql.listen(CHANNEL, () => void tick()).catch(() => null)
  void tick()
  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      await (await listening)?.unlisten().catch(() => {})
      // Hand back leases of runs cut short, so the next start doesn't wait for them to expire.
      await db.update(schema.jobs).set({ lockedUntil: null, lockedBy: null }).where(dsql`${schema.jobs.lockedBy} = ${WHO}`)
    },
  }
}
