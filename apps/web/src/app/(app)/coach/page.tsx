import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { aiEnabledFor, modelId } from '@/ai'
import { goalFormContext } from '@/core/goals'
import { loadThread } from '@/core/coach-messages'
import { loadClearedToday, loadNeedsYou } from '@/core/needs-you'
import { loadPatterns } from '@/core/patterns'
import { localAiDown, localAiStatus } from '@/ai/local'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { cn } from '@/ui/cn'
import { Card, Skeleton } from '@/ui/components/card'
import { AskThread } from '@/ui/components/coach/ask-thread'
import { CoachPanes } from '@/ui/components/coach/coach-panes'
import { isDemo } from '@/core/demo'
import { ConnectCoach } from '@/ui/components/coach/connect-coach'
import { LocalAiDown } from '@/ui/components/coach/local-ai-down'
import { NeedsYouPanel } from '@/ui/components/coach/needs-you-panel'
import { PatternsWeek } from '@/ui/components/coach/patterns-week'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Rail } from '@/ui/components/rail'
import { PromptInput } from '@/ui/beui/agents/prompt-input'

export const metadata: Metadata = { title: 'Coach' }

export default function CoachPage({ searchParams }: PageProps<'/coach'>) {
  return (
    <Suspense fallback={<PageGrid aria-busy><GridItem span={{ base: 12, lg: 7 }}><Skeleton className="h-[640px] rounded-lg" /></GridItem><Rail span={{ base: 12, lg: 5 }}><Skeleton className="h-[460px] rounded-lg" /><Skeleton className="h-[220px] rounded-lg" /></Rail></PageGrid>}>
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
  const aiOn = (await aiEnabledFor(user, 'chat')) && !down
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
        // Beside Needs you it grows with the row (`flex-1 basis-0`) so the rail ends level with it and the thread scrolls inside;
        // stacked, a thread gets a fixed height (an empty Ask is only as tall as its content).
        <Card as="section" aria-labelledby="ask-coach" className={cn('flex flex-col overflow-hidden p-0 grid-lg:min-h-[28rem] grid-lg:flex-1 grid-lg:basis-0', (aiOn || thread.length > 0) && 'h-[min(680px,max(460px,calc(100dvh-22rem)))] grid-lg:h-auto')}>
          <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 id="ask-coach" className="text-heading text-ink">Ask</h2>
            <span className="flex items-center gap-1.5 text-small text-ink-3">
              <span aria-hidden className={aiOn ? 'size-1.5 rounded-full bg-good' : down ? 'size-1.5 rounded-full bg-warn' : 'size-1.5 rounded-full bg-ink-3'} />
              {aiOn ? 'Chat model ready' : down ? <span className="text-warn">Local AI not running</span> : 'No model connected'}
              {model ? <span className="sr-only"> ({model})</span> : null}
            </span>
          </header>
          {!aiOn && thread.length === 0 ? (
            <>
              <div className="px-5 pb-4">{down ? <LocalAiDown message={down.message} /> : <ConnectCoach demo={isDemo()} />}</div>
              <div className="mt-auto px-3 pb-3"><PromptInput disabled minRows={1} placeholder={down ? 'Local AI is not running.' : 'Connect an AI model to ask questions.'} aria-label="Ask about your data" /></div>
            </>
          ) : (
            <>
              {!aiOn ? <div className="px-5 pb-3">{down ? <LocalAiDown message={down.message} /> : <ConnectCoach compact demo={isDemo()} />}</div> : null}
              <AskThread thread={thread} enabled={aiOn} initial={initial} timezone={user.timezone} />
            </>
          )}
        </Card>
      }
      patterns={<PatternsWeek patterns={patterns} />}
    />
  )
}
