import { z } from 'zod'

/** POST /api/v1/push/action: a button tapped on a web push notification. `action` is one of that message's own button values. */
export const PushAction = z.object({ id: z.uuid(), action: z.string().min(1).max(80) })
export type PushAction = z.infer<typeof PushAction>

export const PushActionResult = z.object({ ok: z.literal(true), text: z.string(), url: z.string().optional() })
export type PushActionResult = z.infer<typeof PushActionResult>
