import { TodayAction as action, type TodayResponse } from '@relife/contract'
import { companionView } from '../companion'
import { authenticate, apiError, denied } from '../auth/request'
import { addGoalProgress, setCheck } from '../schedules'
import { applyQuickLog, parseQuickLog } from '../quicklog'
import type { XpNews } from '../xp'
import type { User } from '../user'
import { withIdempotency } from './idempotency'

// GET /api/v1/today reads the character, today's quests and routines; POST /api/v1/today/actions checks a routine off, adds
// to a goal (water +250) or quick-logs ("coffee 2"), the same as Today and ⌘K. Scope `companion` (the extension) or `full`.
// /api/companion is the same pair under its old name; `legacy` keeps its old `{ error: string }` bodies.

type Opts = { legacy?: boolean }

/** Rescore today's XP after a log. Never lets a scoring problem block the log itself (as in actions.ts). */
async function xpAfterLog(user: User): Promise<XpNews> {
  try {
    const { refreshXp } = await import('../xp')
    return await refreshXp(user)
  } catch (e) {
    console.error('[xp]', e instanceof Error ? e.message : e)
    return { unlocked: [] }
  }
}

export async function getToday(req: Request, o: Opts = {}) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a, o)
  return Response.json({ ok: true, ...(await companionView(a.user)) } satisfies TodayResponse)
}

export async function postAction(req: Request, o: Opts = {}) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a, o)
  const parsed = action.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError(400, 'bad_request', 'Bad request.', o)
  const act = parsed.data
  return withIdempotency(a.device.id, req.headers.get('idempotency-key'), async () => {
    let message: string
    try {
      if (act.action === 'check') {
        await setCheck(a.user, act.scheduleId, new Date(act.occurrence), act.status)
        message = act.status === 'done' ? 'Done.' : act.status === 'skipped' ? 'Skipped for today.' : 'Undone.'
      } else if (act.action === 'add') {
        await addGoalProgress(a.user, act.scheduleId, act.amount)
        message = 'Added.'
      } else {
        const q = parseQuickLog(act.text)
        if (!q) return apiError(422, 'bad_request', 'Try “water 250”, “mood 4” or “spent 120 chai”', o)
        message = await applyQuickLog(a.user, q)
      }
    } catch (e) {
      // setCheck and addGoalProgress throw when the routine isn't this user's or isn't a quantity routine.
      const msg = e instanceof Error ? e.message : ''
      const status = /not found/i.test(msg) ? 404 : /Not a quantity/i.test(msg) ? 422 : 500
      if (status === 500) console.error('[companion]', msg || e)
      return apiError(status, status === 404 ? 'not_found' : status === 422 ? 'bad_request' : 'unavailable', status === 500 ? 'Could not save. Try again.' : msg, o)
    }
    const news = await xpAfterLog(a.user)
    return Response.json({ ok: true, message, news, view: await companionView(a.user) })
  })
}
