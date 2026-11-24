import type { ProposedAction } from '@/db/schema'
import { itemTitle } from '@/domain/coach-opening'
import type { NeedsYouItem, NeedsYouKind } from '@/domain/needs-you'
import { pictureSpec, type PictureRef } from '../../picture'

// The picture a row of the queue (and Cleared today, and History) wears. One answer per kind: a merchant's logo for a
// category pick, the app's logo for a message it could not read, and for the cards the coach writes the picture of what
// they are about (a pill for the vitamin alert, delivery for the food delivery nudge), else the area's, else Coach's.

const COACH: PictureRef = { of: 'nav', to: '/coach' }
const GENERIC_ROUTINE = '/routines/check.png'

/** A routine picture for `name`, or null when the name matches none (the generic tick is not a picture of anything). */
const routine = (name: string, kind?: string, area?: string): PictureRef | null => {
  const ref: PictureRef = { of: 'routine', name, kind, area }
  const spec = pictureSpec(ref)
  return spec.type === 'art' && spec.src === GENERIC_ROUTINE ? null : ref
}
const category = (name: string): PictureRef | null => (pictureSpec({ of: 'category', name }).type === 'letter' ? null : { of: 'category', name })
const area = (a: string | undefined): PictureRef | null => (a && pictureSpec({ of: 'area', to: a }).type !== 'letter' ? { of: 'area', to: a } : null)

/** What a card written by the coach is about: its first action, else its title, else its area, else Coach. */
function aboutPicture(title: string, meta?: string, action?: ProposedAction): PictureRef {
  const where = meta?.split(' · ')[0]?.toLowerCase()
  const kind = action?.type === 'schedule' ? action.kind : action?.type === 'tracker' ? action.kind : undefined
  return (
    (action && (routine(action.name, kind, action.category) ?? area(action.category)))
    || category(title) || routine(title, undefined, where) || area(where) || COACH
  )
}

/** The app a message came from: its logo, else the phone (a text, a screenshot or a shortcut has no logo of its own). */
export function appPicture(app: string, title: string): PictureRef {
  const ref: PictureRef = { of: 'connector', id: app, name: title }
  return pictureSpec(ref).type === 'letter' ? { of: 'device', name: 'phone' } : ref
}

export function kindPicture(kind: NeedsYouKind | string, title: string, o: { meta?: string; action?: ProposedAction; merchant?: string; app?: string } = {}): PictureRef {
  switch (kind) {
    case 'categorise': return { of: 'merchant', name: o.merchant ?? title }
    case 'unread': return appPicture(o.app ?? 'sms', title)
    case 'party-invite': return { of: 'area', to: 'relationships' }
    case 'recovery': return { of: 'nav', to: '/' }
    case 'review': return { of: 'nav', to: '/plan' }
    case 'goal-draft': return routine(title) ?? { of: 'nav', to: '/plan' }
    default: return aboutPicture(title, o.meta, o.action)
  }
}

export function queuePicture(item: NeedsYouItem): PictureRef {
  switch (item.kind) {
    case 'categorise': return kindPicture(item.kind, item.merchant, { merchant: item.merchant })
    case 'unread': return kindPicture(item.kind, item.summary.title, { app: item.summary.app })
    case 'party-invite': return kindPicture(item.kind, itemTitle(item))
    case 'goal-draft': return kindPicture(item.kind, item.draft.title)
    default: return kindPicture(item.kind, item.insight.title, { meta: item.insight.meta, action: item.insight.actions?.[0] })
  }
}
