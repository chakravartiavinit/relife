import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { aiEnabledFor, modelId } from '@/ai'
import { goalFormContext } from '@/core/goals'
import { loadThread } from '@/core/coach-messages'
import { loadClearedToday } from '@/core/needs-you'
import { localAiDown, localAiStatus } from '@/ai/local'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { cn } from '@/ui/cn'
import { Card, Skeleton } from '@/ui/components/card'
import { AskThread } from '@/ui/components/coach/ask-thread'
import { ScrollToAsk } from '@/ui/components/coach/scroll-to-ask'
import { isDemo } from '@/core/demo'
import { ConnectCoach } from '@/ui/components/coach/connect-coach'
import { LocalAiDown } from '@/ui/components/coach/local-ai-down'
import { NeedsYouPanel } from '@/ui/components/coach/needs-you-panel'
import { PatternsWeek } from '@/ui/components/coach/patterns-week'
import { coachPatterns, coachQueue } from './loaders'
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
  const [{ items, categories }, cleared, thread, { patterns }, local] = await Promise.all([
    coachQueue(), loadClearedToday(user), loadThread(user), coachPatterns(), localAiStatus('chat'),
  ])
  const today = localDate(new Date(), user.timezone)
  const goal = items.some((i) => i.kind === 'goal-draft') ? await goalFormContext(user) : null
  const down = localAiDown(local) ? local : null
  // A local model whose server isn't answering counts as off: Ask stays closed and the card says how to start it.
  const aiOn = (await aiEnabledFor(user, 'chat')) && !down
  const model = modelId('chat')

  return (
    // A new ?ask= (Capture's hand-off while Coach is already open) remounts the page, so the prefill follows the URL.
    <PageGrid key={initial ?? ''}>
      <GridItem span={{ base: 12, lg: 7 }}>
        <NeedsYouPanel
          items={items} filter={filter} categories={categories} timezone={user.timezone} today={today}
          goal={goal} cleared={cleared} aiOn={aiOn} patterns={patterns}
        />
      </GridItem>
      <Rail span={{ base: 12, lg: 5 }}>
        {/* Beside Needs you it grows with the row (`flex-1 basis-0`) so the rail ends level with it and the thread scrolls inside;
            stacked, a thread gets a fixed height (an empty Ask is only as tall as its content). */}
        <Card as="section" aria-labelledby="ask-coach" className={cn('flex scroll-mt-20 flex-col overflow-hidden p-0 grid-lg:min-h-[30rem] grid-lg:flex-1 grid-lg:basis-0', (aiOn || thread.length > 0) && 'h-[min(680px,max(460px,calc(100dvh-22rem)))] grid-lg:h-auto')}>
          <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 id="ask-coach" className="font-display text-heading text-ink">Ask</h2>
            <span className="flex items-center gap-1.5 text-small text-ink-3">
              <span aria-hidden className={aiOn ? 'size-1.5 rounded-full bg-good' : down ? 'size-1.5 rounded-full bg-warn' : 'size-1.5 rounded-full shadow-[inset_0_0_0_1.5px_currentColor]'} />
              {aiOn ? 'Chat model ready' : down ? <span className="text-warn-ink">Local AI not running</span> : 'No model connected'}
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
        <div className="flex-none! [&>*]:h-full"><PatternsWeek patterns={patterns} today={today} /></div>
      </Rail>
      {/* ?ask= (Capture's hand-off) and ?view=ask bring the Ask card into view: on a phone it sits under Needs you. */}
      <ScrollToAsk when={initial !== undefined || sp.view === 'ask'} />
    </PageGrid>
  )
}
