'use client'

import brand from '@relife/brand/brand.json'
import type { RecoveryView } from '@/domain/recovery'
import type { NeedsYouItem } from '@/domain/needs-you'
import { Card } from '../card'
import { AnswerCard, QuestionBubble } from './answer-card'
import { ConnectCoach } from './connect-coach'
import { LocalAiDown } from './local-ai-down'
import { NeedsYouList } from './needs-you-list'
import { QueueItem, ResolvedItem } from './queue-item'

// /dev/ui: every kind in the Needs you queue, the resolved row, the answer card in each state and the no-model card,
// drawn from fixtures. The list uses the real actions, so a button on a fixture id fails and the row comes back with an
// error toast (which is the error state).

const AT = '2026-11-12T09:00:00.000Z'
const recovery: RecoveryView = {
  id: '00000000-0000-4000-8000-000000000001', version: 1, localDate: '2026-11-12', choice: null, questId: null,
  missed: [{ id: 'miss', title: 'Deep work 90 min', progress: 30, target: 90, unit: 'min' }],
  preview: { parentId: 'miss', statId: 'tracker:focus', metric: 'Focus', title: '40 min deep work today', target: 40, unit: 'min', op: 'gte', aggregation: 'sum', fromDate: '2026-11-12', toDate: '2026-11-12', rank: 'E', xp: 20, area: 'skills', baseline: 60 },
}
const insight = (id: string, kind: 'alert' | 'nudge' | 'review' | 'plan', title: string, body: string, extra: object = {}) => ({ id, kind, title, body, at: AT, ...extra })

const ITEMS: NeedsYouItem[] = [
  { kind: 'recovery', id: 'f-rec', insight: insight('f-rec', 'plan', 'Yesterday’s deep work quest was missed', ''), recovery, at: AT },
  { kind: 'alert', id: 'f-alert', insight: insight('f-alert', 'alert', 'Vitamin D3 runs out in 9 days', '9 capsules left at 1 a day.', { meta: 'Health · Today' }), at: AT },
  { kind: 'review', id: 'f-review', insight: insight('f-review', 'review', '2 goals to review', 'Type 70 wpm moved toward target. Blackbird went flat.'), at: AT },
  { kind: 'plan', id: 'f-plan', insight: insight('f-plan', 'plan', 'Add a wind-down routine at 22:30', 'You sleep 50 minutes more on nights you journal.', { actions: [{ type: 'schedule', name: 'Wind down', category: 'mind', rrule: 'FREQ=DAILY', time: '22:30' }] }), at: AT },
  { kind: 'goal-draft', id: 'f-draft', insight: insight('f-draft', 'plan', 'Solve a medium DSA problem in 30 minutes', ''), draft: { title: 'Solve a medium DSA problem in 30 minutes', reason: 'You said you want to get better at interviews.', area: 'skills', measure: { checkIn: 'Minutes to solve', unit: 'min' }, direction: 'decrease', target: 30, targetDate: '2027-01-11', cadence: 'weekly', actions: [] }, at: AT },
  { kind: 'unread', id: 'f-unread', rawEventIds: ['f-raw'], summary: { app: 'sms', title: 'Bank SMS', text: 'INR 1,240.00 debited from A/c XX4821 via UPI to MERCHANT XYZ Ref 4012.' }, reason: 'Couldn’t read it: No parser matched', original: 'INR 1,240.00 debited from A/c XX4821 via UPI to MERCHANT XYZ Ref 4012.', at: AT },
  { kind: 'categorise', id: 'f-cat', merchant: 'Blinkit', sampleTxnId: 'f-txn', count: 3, total: 889, currency: 'INR', at: AT },
  { kind: 'nudge', id: 'f-nudge', insight: insight('f-nudge', 'nudge', 'Food delivery is up 32% this month', 'Most orders land between 21:00 and 23:00.'), at: AT },
]

const SOURCES = [{ label: 'Zepto · 1–31 Oct', peek: 'merchant:Zepto' }, { label: 'Spending by merchant' }]

export function CoachGallery() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <p className="mb-3 text-small text-ink-3">Needs you, every kind in rank order. Buttons use the real actions, so on these fixture ids they fail and the row comes back with an error toast.</p>
        <Card className="max-w-[640px] overflow-hidden px-0 py-0">
          <NeedsYouList items={ITEMS} timezone="Asia/Kolkata" today="2026-11-12" categories={['Groceries', 'Food delivery', 'Transport', 'Eating out', 'Shopping', 'Health', 'Bills']} goal={null} />
        </Card>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-small text-ink-3">Resolved row, with and without Undo, and a row while it works</p>
        <Card className="px-0 py-0 divide-y divide-divider">
          <ResolvedItem text="Dismissed: Food delivery is up 32% this month" undo={<span className="text-small font-medium text-ink-2">Undo</span>} />
          <ResolvedItem text="Blinkit filed under Groceries · remembered" />
          <QueueItem kind="unread" label="Bank SMS · now" title={`A message ${brand.name} couldn’t read`} busy>Trying again…</QueueItem>
        </Card>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-small text-ink-3">Ask: question, answer with sources and Why?, a failed answer with Retry</p>
        <div className="flex flex-col items-end gap-3 rounded-lg bg-surface-2 p-3">
          <QuestionBubble>How much did I spend on Zepto last month?</QuestionBubble>
          <AnswerCard text={'You spent about ₹6,800 on Zepto in October across 23 orders, 18% more than September.\n\n14 of the orders were after 21:00.'} sources={SOURCES} />
          <AnswerCard error text="LLM error: the model took too long to answer." onRetry={() => {}} />
        </div>
      </div>
      <div className="max-w-[420px] lg:col-span-2">
        <p className="mb-3 text-small text-ink-3">No model: the Connect card with what still works</p>
        <ConnectCoach />
      </div>
      <div className="max-w-[420px] lg:col-span-2">
        <p className="mb-3 text-small text-ink-3">Free local AI chosen, server not answering (the pill reads “Local AI not running”)</p>
        <span className="mb-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-caption font-medium text-ink-2 shadow-1"><span aria-hidden className="size-1.5 rounded-full bg-warn" /><span className="text-warn">Local AI not running</span></span>
        <LocalAiDown message="Nothing answered at localhost:11434. Install Ollama from ollama.com, then run `ollama pull qwen3:4b-instruct`." />
        <div className="mt-3"><LocalAiDown message="Nothing answered at ollama:11434. Start it with `docker compose --profile ai up -d`, or pick another provider in You › Connections." /></div>
      </div>
    </div>
  )
}
