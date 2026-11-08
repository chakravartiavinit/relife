import { Output } from 'ai'
import { z } from 'zod'
import type { User } from '@/core/user'
import { saveAiKinds, unsortedPlaces } from '@/core/activity'
import { ACTIVITY_KINDS, KIND_INFO } from '@/domain/activity'
import { aiEnabled, model } from '../models'
import { generate } from '../run'

/**
 * Sort websites and Mac apps the built-in list doesn't know, once each. Only the site or app name goes to the
 * model, never page titles or paths. The answer is saved as a rule ('ai'), so a place is never asked about again,
 * and your own choice on Activity always replaces it.
 */
export async function classifySites(user: User) {
  if (!aiEnabled('parse')) return null
  const keys = await unsortedPlaces(user)
  if (!keys.length) return null
  const names = keys.map((k) => (k.startsWith('app:') ? `${k.slice(4)} (Mac app)` : k))
  const res = await generate('parse', 'job.classify-sites', {
    model: model('parse'),
    output: Output.object({ schema: z.object({ items: z.array(z.object({ name: z.string(), kind: z.enum(ACTIVITY_KINDS) })) }) }),
    system: [
      'Sort each website or Mac app by what time spent on it usually is, for a personal screen-time tracker.',
      `Kinds: ${ACTIVITY_KINDS.map((k) => `${k} (${KIND_INFO[k].label})`).join(', ')}.`,
      'work: coding, docs, design, dev tools, AI assistants, work chat tools used for work. learning: courses, tutorials, practice sites, references.',
      'entertainment: video, streaming, games, sports, memes. social: feeds like X, Instagram, Reddit, LinkedIn. communication: messaging, email, video calls.',
      'Use other only when you genuinely cannot tell. Answer for every name, copying the name exactly.',
    ].join(' '),
    prompt: names.join('\n'),
  })
  const byName = new Map((res.output?.items ?? []).map((i) => [i.name.trim().toLowerCase(), i.kind]))
  const kinds = keys.flatMap((k, i) => {
    const kind = byName.get(names[i].toLowerCase()) ?? byName.get(k.replace(/^app:/, ''))
    return kind ? [{ key: k, kind }] : []
  })
  const changedDays = await saveAiKinds(user, kinds)
  return `${kinds.length} sorted (${kinds.filter((k) => k.kind !== 'other').length} not other), ${changedDays} days re-sorted`
}
