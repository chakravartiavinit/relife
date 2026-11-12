import { z } from 'zod'
import { AREAS, PLATFORMS } from './config'

const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.string()).transform((a) => [...new Set(a)].filter((v): v is T[number] => (values as readonly string[]).includes(v)))

export const joinSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  interests: list(AREAS),
  platforms: list(PLATFORMS),
  ref: z.string().trim().regex(/^[A-Z2-9]{8}$/).optional().catch(undefined),
  source: z.string().trim().max(120).optional(),
  utm: z.record(z.string(), z.string().max(120)).optional(),
})
export type JoinInput = z.infer<typeof joinSchema>

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

/** Turns the form's FormData into the unvalidated shape the schema expects. */
export function readJoinForm(fd: FormData) {
  const str = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : undefined)
  const utm = Object.fromEntries(UTM_KEYS.flatMap((k) => (str(k) ? [[k, str(k)!.slice(0, 120)]] : [])))
  return {
    email: str('email') ?? '',
    interests: fd.getAll('interests').filter((v): v is string => typeof v === 'string'),
    platforms: fd.getAll('platforms').filter((v): v is string => typeof v === 'string'),
    ref: str('ref')?.toUpperCase() || undefined,
    source: str('source') || undefined,
    utm: Object.keys(utm).length ? utm : undefined,
  }
}
