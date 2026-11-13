import { Output } from 'ai'
import { z } from 'zod'
import { gatherBriefFacts, saveBrief, todaysBriefRows } from '@/core/briefs'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { BRIEF_SCOPES, MAX_BRIEF_CHARS, briefHash, pickAiLines, ruleLine, shouldRewrite, type BriefScope, type RuleBrief } from '@/domain/briefs'
import { aiEnabled, model, modelId } from '../models'
import { generate } from '../run'

/**
 * The one-line summary for Today, each area and Time. Rules write every line (src/domain/briefs.ts), with no model
 * needed. A scope is only written again when its facts changed and it was last written 2+ hours ago, so a burst of
 * `data.changed` does one pass. When a model is set, one call rewords every scope that changed; its lines are
 * kept only when they fit, and the rules line stays when the call fails.
 */
export async function areaBriefs(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [facts, prev] = await Promise.all([gatherBriefFacts(user, now), todaysBriefRows(user, today)])

  const changed: { scope: BriefScope; rule: RuleBrief; hash: string }[] = []
  for (const scope of BRIEF_SCOPES) {
    const rule = ruleLine(scope, facts[scope])
    if (!rule) continue
    const hash = briefHash(facts[scope])
    const p = prev.get(scope)
    if (shouldRewrite(p ? { hash: p.why.hash, updatedAt: p.updatedAt } : null, hash, now)) changed.push({ scope, rule, hash })
  }
  for (const c of changed) await saveBrief(user, c.scope, today, c.rule.text, { facts: c.rule.facts, source: 'rules', hash: c.hash })
  if (!changed.length) return undefined

  let reworded = 0
  if (aiEnabled('parse')) {
    try {
      const res = await generate('parse', 'briefs.area', {
        model: model('parse'),
        output: Output.object({ schema: z.object({ lines: z.array(z.object({ scope: z.enum(BRIEF_SCOPES), text: z.string() })) }) }),
        system: [
          'You write the one-line summary under each area title of a personal life tracker.',
          `For each scope, reword the given line in plain, warm words, at most ${MAX_BRIEF_CHARS} characters.`,
          'Only restate the facts you are given: keep every number exactly, add none, and give no advice.',
          'Answer once for every scope listed, copying the scope name exactly.',
        ].join(' '),
        prompt: changed.map((c) => `${c.scope}: ${c.rule.text}\nFacts: ${c.rule.facts.map((f) => `${f.label} ${f.value}`).join('; ')}`).join('\n\n'),
      })
      const lines = pickAiLines(Object.fromEntries((res.output?.lines ?? []).map((l) => [l.scope, l.text])), changed.map((c) => c.scope))
      for (const c of changed) {
        const text = lines[c.scope]
        if (!text) continue
        await saveBrief(user, c.scope, today, text, { facts: c.rule.facts, source: 'ai', model: modelId('parse'), hash: c.hash })
        reworded++
      }
    } catch {
      // The rules lines are already saved.
    }
  }
  return `${changed.length} written${reworded ? `, ${reworded} reworded` : ''}`
}
