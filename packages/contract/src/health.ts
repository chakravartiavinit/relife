import { z } from 'zod'

/** One day of Health Connect numbers, summarised by the Android app in the server's time zone. */
export const HealthDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(200_000).optional(),
  activeKcal: z.number().min(0).max(20_000).optional(),
  heartRateAvg: z.number().min(20).max(250).optional(),
  heartRateMin: z.number().min(20).max(250).optional(),
  heartRateMax: z.number().min(20).max(250).optional(),
  restingHr: z.number().min(20).max(200).optional(),
  weightKg: z.number().min(20).max(400).optional(),
  /** Sleep that ended on this day (the wake date), minus awake stages. */
  sleepMinutes: z.number().min(0).max(1440).optional(),
  bedtime: z.iso.datetime().optional(),
  wake: z.iso.datetime().optional(),
  exercise: z.array(z.object({ type: z.string().max(40), minutes: z.number().min(0).max(1440) })).max(30).default([]),
})
export type HealthDay = z.infer<typeof HealthDay>

/** POST /api/v1/health (scope `ingest`). An empty `days` is allowed: the app uses it to learn the server's time zone. */
export const HealthBatch = z.object({ source: z.literal('health-connect'), days: z.array(HealthDay).max(60) })
export type HealthBatch = z.infer<typeof HealthBatch>

export const HealthIngestResult = z.object({ ok: z.literal(true), received: z.number(), inserted: z.number(), timezone: z.string() })
export type HealthIngestResult = z.infer<typeof HealthIngestResult>
