import { z } from 'zod'
import { ActivityKind } from './common'

/** The extension posts stretches of focused time to POST /api/v1/activity (older: /api/activity), about once a minute. */

const CourseKind = z.enum(['course', 'book', 'show', 'video', 'other'])

const BrowserSegment = z.object({
  id: z.string().min(1).max(80),
  source: z.literal('browser'),
  domain: z.string().max(200).nullish(),
  path: z.string().max(500).nullish(),
  title: z.string().max(500).nullish(),
  /** ISO string or epoch milliseconds. */
  start: z.union([z.string(), z.number()]),
  end: z.union([z.string(), z.number()]),
  meta: z.object({
    channel: z.string().max(200).optional(),
    playing: z.boolean().optional(),
    course: z.object({
      title: z.string().min(1).max(200), lesson: z.string().max(200).optional(),
      done: z.number().optional(), total: z.number().optional(), track: z.boolean().optional(), url: z.string().max(500).optional(),
      kind: CourseKind.optional(), image: z.string().max(1000).optional(), icon: z.string().max(1000).optional(),
      auto: z.boolean().optional(),
      episode: z.object({
        episode: z.string().max(200).optional(), number: z.number().int().min(0).max(100_000).optional(), season: z.number().int().min(0).max(1000).optional(),
        duration: z.number().min(0).max(86_400).optional(), position: z.number().min(0).max(86_400).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
})

/** The Mac app's front-app stretches (names only). The server drops browsers from these: the extension covers them. */
const MacSegment = z.object({
  id: z.string().min(1).max(80),
  source: z.literal('mac'),
  app: z.string().min(1).max(80),
  bundleId: z.string().max(200).nullish(),
  start: z.union([z.string(), z.number()]),
  end: z.union([z.string(), z.number()]),
})

const Segment = z.discriminatedUnion('source', [BrowserSegment, MacSegment])

/** "Track this course" from the popup. */
const Course = z.object({
  domain: z.string().min(1).max(200), path: z.string().max(500).default(''),
  title: z.string().min(1).max(200), url: z.string().max(500), done: z.number().optional(), total: z.number().optional(),
  kind: CourseKind.optional(), image: z.string().max(1000).optional(), icon: z.string().max(1000).optional(), lesson: z.string().max(200).optional(),
})

/** "Counts as" from the popup: what a site counts as (null clears the rule). */
const Rule = z.object({ domain: z.string().min(1).max(200), kind: ActivityKind.nullable() })

export const ActivityBatch = z.object({
  segments: z.array(Segment).max(500).default([]),
  courses: z.array(Course).max(20).default([]),
  rules: z.array(Rule).max(20).default([]),
})
/** What the server reads (every list present). */
export type ActivityBatch = z.output<typeof ActivityBatch>
/** What a client may send (empty lists can be left out). */
export type ActivityBatchInput = z.input<typeof ActivityBatch>
