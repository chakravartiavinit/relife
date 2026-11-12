import { z } from 'zod'
import { env } from '@/core/env'
import { getUser } from '@/core/user'
import { companionView, extensionAuthorized, markExtensionSeen } from '@/core/companion'
import { addGoalProgress, setCheck } from '@/core/schedules'
import { applyQuickLog, parseQuickLog } from '@/core/quicklog'
import type { XpNews } from '@/core/xp'

// The extension popup's Today tab: GET reads the character, today's quests and routines; POST checks a routine off,
// adds to a goal (water +250) or quick-logs ("coffee 2"), the same as Today and ⌘K. Same bearer token as
// /api/activity (Connectors → Laptop activity). Open ReLife pages pick the change up through dataVersion().

const logValue = z.number().finite().min(-1_000_000).max(1_000_000)
const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check'), scheduleId: z.string().uuid(),
    occurrence: z.string().max(40).refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid time'),
    status: z.enum(['done', 'skipped']).nullable(),
  }),
  z.object({ action: z.literal('add'), scheduleId: z.string().uuid(), amount: logValue }),
  z.object({ action: z.literal('log'), text: z.string().trim().min(1).max(200) }),
])

/** 503 before Laptop activity is connected (as /api/activity), else 401 for a token that doesn't match. */
const denied = () => env('ACTIVITY_TOKEN')
  ? Response.json({ error: 'unauthorized: the token doesn’t match the one on Connectors → Laptop activity' }, { status: 401 })
  : Response.json({ error: 'Laptop activity is not connected. Set a token on the Connectors page.' }, { status: 503 })

/** Rescore today's XP after a log. Never lets a scoring problem block the log itself (as in actions.ts). */
async function xpAfterLog(user: Awaited<ReturnType<typeof getUser>>): Promise<XpNews> {
  try {
    const { refreshXp } = await import('@/core/xp')
    return await refreshXp(user)
  } catch (e) {
    console.error('[xp]', e instanceof Error ? e.message : e)
    return { unlocked: [] }
  }
}

export async function GET(req: Request) {
  const user = await getUser() // loads saved keys, including ACTIVITY_TOKEN
  if (!extensionAuthorized(req)) return denied()
  await markExtensionSeen()
  return Response.json({ ok: true, ...(await companionView(user)) })
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!extensionAuthorized(req)) return denied()
  const parsed = action.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ ok: false, error: 'bad request', issues: parsed.error.issues.slice(0, 3) }, { status: 400 })
  const a = parsed.data
  let message: string
  try {
    if (a.action === 'check') {
      await setCheck(user, a.scheduleId, new Date(a.occurrence), a.status)
      message = a.status === 'done' ? 'Done.' : a.status === 'skipped' ? 'Skipped for today.' : 'Undone.'
    } else if (a.action === 'add') {
      await addGoalProgress(user, a.scheduleId, a.amount)
      message = 'Added.'
    } else {
      const q = parseQuickLog(a.text)
      if (!q) return Response.json({ ok: false, error: 'Try “water 250”, “mood 4” or “spent 120 chai”' }, { status: 422 })
      message = await applyQuickLog(user, q)
    }
  } catch (e) {
    // setCheck and addGoalProgress throw when the routine isn't this user's or isn't a quantity routine.
    const known = e instanceof Error && /not found|Not a quantity/i.test(e.message)
    if (!known) console.error('[companion]', e instanceof Error ? e.message : e)
    return Response.json({ ok: false, error: known ? (e as Error).message : 'Could not save. Try again.' }, { status: known ? 404 : 500 })
  }
  const news = await xpAfterLog(user)
  return Response.json({ ok: true, message, news, view: await companionView(user) })
}
