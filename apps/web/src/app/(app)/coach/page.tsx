import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { aiEnabled, modelId } from '@/ai'
import { goalFormContext } from '@/core/goals'
import { loadThread } from '@/core/coach-messages'
import { loadClearedToday, loadNeedsYou } from '@/core/needs-you'
import { loadPatterns } from '@/core/patterns'
import { localAiDown, localAiStatus } from '@/ai/local'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { Card, Skeleton } from '@/ui/components/card'
import { AskThread } from '@/ui/components/coach/ask-thread'
import { CoachPanes } from '@/ui/components/coach/coach-panes'
import { CoachTabs } from '@/ui/components/coach/coach-tabs'
import { isDemo } from '@/core/demo'
import { ConnectCoach } from '@/ui/components/coach/connect-coach'
import { LocalAiDown } from '@/ui/components/coach/local-ai-down'
import { NeedsYouPanel } from '@/ui/components/coach/needs-you-panel'
import { PromptInput } from '@/ui/beui/agents/prompt-input'

export const metadata: Metadata = { title: 'Coach' }

export default function CoachPage({ searchParams }: PageProps<'/coach'>) {
  return (
    <Suspense fallback={<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,32.5rem)]"><Skeleton className="h-[520px] rounded-lg" /><Skeleton className="h-[520px] rounded-lg" /></div>}>
      <Coach searchParams={searchParams} />
    </Suspense>
  )
}

async function Coach({ searchParams }: { searchParams: PageProps<'/coach'>['searchParams'] }) {
  await connection()
  const sp = await searchParams
  const initial = typeof sp.ask === 'string' ? sp.ask : undefined
  // `?filter=data` is the old Inbox (messages the app couldn't read, payments to sort); `?filter=decisions` is everything else.
  const filter = sp.filter === 'data' || sp.filter === 'decisions' ? sp.filter : null
  const user = await getUser()
  const [{ items, categories }, cleared, thread, patterns, local] = await Promise.all([
    loadNeedsYou(user), loadClearedToday(user), loadThread(user), loadPatterns(user), localAiStatus('chat'),
  ])
  const goal = items.some((i) => i.kind === 'goal-draft') ? await goalFormContext(user) : null
  const down = localAiDown(local) ? local : null
  // A local model whose server isn't answering counts as off: Ask stays closed and the card says how to start it.
  const aiOn = aiEnabled('chat') && !down
  const model = modelId('chat')

  return (
    <CoachPanes
      // A new ?ask= (Capture's hand-off while Coach is already open) remounts the panes, so the prefill and pane follow the URL.
      key={initial ?? ''}
      // ?ask= (Capture's ⌘↵ hand-off) forces the Ask pane on a phone, as does ?view=ask.
      initial={initial !== undefined || sp.view === 'ask' ? 'ask' : 'needs'}
      count={items.length}
      needs={
        <NeedsYouPanel
          items={items} filter={filter} categories={categories} timezone={user.timezone} today={localDate(new Date(), user.timezone)}
          goal={goal} cleared={cleared} aiOn={aiOn} patternChanges={patterns.changes.length}
        />
      }
      ask={
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CoachTabs className="max-lg:hidden" />
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-caption font-medium text-ink-2 shadow-1 max-lg:ml-auto">
              <span aria-hidden className={aiOn ? 'size-1.5 rounded-full bg-good' : down ? 'size-1.5 rounded-full bg-warn' : 'size-1.5 rounded-full bg-ink-3'} />
              {aiOn ? 'Chat model ready' : down ? <span className="text-warn">Local AI not running</span> : 'No model connected'}
              {model ? <span className="sr-only"> ({model})</span> : null}
            </span>
          </div>
          {!aiOn && thread.length === 0 ? (
            <>
              {down ? <LocalAiDown message={down.message} /> : <ConnectCoach demo={isDemo()} />}
              <Card className="p-2"><PromptInput disabled minRows={1} placeholder={down ? 'Local AI is not running.' : 'Connect an AI model to ask questions.'} aria-label="Ask about your data" /></Card>
            </>
          ) : (
            <>
              {!aiOn ? (down ? <LocalAiDown message={down.message} /> : <ConnectCoach compact demo={isDemo()} />) : null}
              <Card as="section" aria-label="Ask" className="flex h-[min(680px,max(460px,calc(100dvh-22rem)))] flex-col overflow-hidden p-0">
                <AskThread thread={thread} enabled={aiOn} initial={initial} timezone={user.timezone} />
              </Card>
            </>
          )}
        </div>
      }
    />
  )
}
