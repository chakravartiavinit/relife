'use client'

import Link from 'next/link'
import { Repeat } from 'lucide-react'
import type { InsightPeek } from '@/core/peek/types'
import { sentenceCase } from '@/domain/text'
import { CATEGORY } from '@/ui/tokens'
import { buttonClass } from '../../button'
import { Badge } from '../../card'
import { InsightBody } from '../../insight-body'
import { InsightActions } from '../../insight-ui'
import { KIND, STATUS } from '../../insight-kinds'
import { RecoveryPanel } from '../../system-quests'
import { PeekFooter, PeekIcon, PeekOpen, PeekSection } from '../peek-parts'

export function insightHeading(d: InsightPeek) {
  const k = KIND[d.kind]
  return { title: sentenceCase(d.title), description: `${k.label} · ${d.when}${d.meta ? ` · ${d.meta.split(' · ')[0]}` : ''}`, icon: <PeekIcon icon={k.icon} color={k.color} /> }
}

/** A Coach item: its text, what it proposes, and the one way to act on it (or what was decided). */
export function InsightPeekView({ data: d }: { data: InsightPeek }) {
  const decided = d.status !== 'pending' ? STATUS[d.status] : null
  return (
    <div>
      {decided ? <Badge color={decided.color}>{decided.label}</Badge> : null}
      <div className="mt-3"><InsightBody body={d.body} review={d.review ?? undefined} kind={d.kind} /></div>

      {d.actions.length ? (
        <PeekSection label="Proposes">
          <ul className="flex flex-col gap-2">
            {d.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2 text-small">
                <Repeat className="size-4 shrink-0" strokeWidth={1.5} style={{ color: CATEGORY[a.category].color }} aria-hidden />
                <span className="font-medium text-ink">{a.name}</span>
                <span className="truncate text-ink-3">{a.summary}</span>
              </li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      {d.recovery ? <div className="mt-6"><RecoveryPanel key={`${d.recovery.id}:${d.recovery.version}`} recovery={d.recovery} /></div> : null}
      {d.status === 'pending' && !d.recovery ? (
        <div className="mt-6">
          {d.goalDraft ? <Link href="/plan" className={buttonClass({ variant: 'primary', size: 'sm' })}>Review on Goals</Link> : <InsightActions id={d.id} hasActions={d.hasActions} />}
        </div>
      ) : null}
      <PeekFooter><PeekOpen href="/coach">Open Coach</PeekOpen></PeekFooter>
    </div>
  )
}
