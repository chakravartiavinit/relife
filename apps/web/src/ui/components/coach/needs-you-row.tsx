'use client'

import brand from '@relife/brand/brand.json'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, CircleAlert, RefreshCw } from 'lucide-react'
import { dismissGoalDraftAction, ignoreRawEvent, recategorize, restoreInsight, resolveInsight, retryRawEvents, undoRecategorize } from '@/app/actions'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { describe } from '@/domain/recurrence'
import { sentenceCase } from '@/domain/text'
import { targetText } from '@/domain/goals'
import type { InsightLite, NeedsYouItem } from '@/domain/needs-you'
import { CATEGORY } from '../../tokens'
import { cn } from '../../cn'
import { Button, buttonClass, buttonLinkClass } from '../button'
import { GoalFormButton, initialFromDraft, type GoalPickerData } from '../goals/goal-form'
import { InsightBody } from '../insight-body'
import { PeekLink } from '../peek/peek-link'
import { Picture } from '../picture'
import { ShareButton } from '../share/share-button'
import { reviewedWeekStart } from '@/domain/share-card'
import { Checkbox } from '@/ui/beui/motion/checkbox'
import { Select } from '../select'
import { useToast } from '../toast'
import { AcceptPartyDialog, declinePartyInvite } from '../party/party-dialogs'
import { QueueItem } from './queue-item'
import { queuePicture } from './queue-picture'
import { RECOVERY_DONE, RecoveryChoices } from './recovery-choices'

/** What a row can ask the list to do. The list owns the collapsed state, so a row that unmounts never loses its Undo. */
export type RowCtx = {
  timezone: string
  today: string
  /** Hide the row now and say what happened; the list puts it back if `action` throws. Pass `undo` where one exists. */
  act: (id: string, text: string, action: () => Promise<unknown>, undo?: () => Promise<unknown>) => void
  /** Collapse the row: its action already succeeded. */
  done: (id: string, text: string) => void
  /** Category chips for a payment, the user's most used first. */
  categories: string[]
  /** What the goal form needs, present only when the queue holds a goal draft. */
  goal: { picker: GoalPickerData; today: string; activeCount: number } | null
  /** A proposal's Connection, already drawn on the server (it stands on `findLinks` / `findChanges`), by item id. */
  connections?: Record<string, React.ReactNode>
}

const when = (at: string, c: RowCtx) => {
  const d = new Date(at)
  const day = localDate(d, c.timezone)
  return day === c.today ? formatTime(d, c.timezone) : formatDay(day)
}

/** "Why?" opens what the card was built from. */
function Why({ id }: { id: string }) {
  return (
    <PeekLink to={{ type: 'insight', id }} className={buttonLinkClass('inline-flex min-h-10 items-center px-2 text-small')}>Why?</PeekLink>
  )
}

/** The first sentence of a card's text, plain, for the one line under its title. */
const lead = (body: string) => {
  const first = body.replace(/\*\*/g, '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('-')) ?? ''
  return first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first
}

/** The exact routine or tracker a proposal would add, as one quiet row with its picture. */
export function ActionPreview({ actions }: { actions: NonNullable<InsightLite['actions']> }) {
  return (
    <ul className="mt-3 flex flex-col gap-2" aria-label="What would be added">
      {actions.map((a, n) => (
        <li key={n} className="flex items-center gap-3 rounded-md bg-surface p-2 pr-3 shadow-[0_0_0_1px_var(--hairline)]">
          <Picture of="routine" name={a.name} kind={a.kind} area={a.category} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">{a.name}</p>
            <p className="truncate text-small text-ink-3">
              {a.type === 'schedule' ? describe(a.rrule.includes('DTSTART') ? a.rrule : `DTSTART:20260101T000000\n${a.rrule.startsWith('RRULE:') ? a.rrule : `RRULE:${a.rrule}`}`) : `New tracker${a.unit ? ` · ${a.unit}` : ''}`}
              {' · '}{CATEGORY[a.category].label}
            </p>
          </div>
          <span className="shrink-0 text-small text-ink-3">New {a.type === 'schedule' ? 'routine' : 'tracker'}</span>
        </li>
      ))}
    </ul>
  )
}

/** What the To sort fold says of its items: "2 messages Zepto couldn’t read, 2 payments to categorise". */
export function sortSummary(items: Extract<NeedsYouItem, { kind: 'unread' | 'categorise' }>[]) {
  const unread = items.filter((i) => i.kind === 'unread').length
  const pay = items.length - unread
  return [unread ? `${unread} ${unread === 1 ? 'message' : 'messages'} ${brand.name} couldn’t read` : '', pay ? `${pay} ${pay === 1 ? 'payment' : 'payments'} to categorise` : ''].filter(Boolean).join(', ')
}

export function NeedsYouRow({ item, ctx }: { item: NeedsYouItem; ctx: RowCtx }) {
  switch (item.kind) {
    case 'recovery': return <RecoveryRow item={item} ctx={ctx} />
    case 'goal-draft': return <GoalDraftRow item={item} ctx={ctx} />
    case 'party-invite': return <PartyInviteRow item={item} ctx={ctx} />
    case 'unread': return <UnreadRow item={item} ctx={ctx} />
    case 'categorise': return <CategoriseRow item={item} ctx={ctx} />
    default: return <InsightRow item={item} ctx={ctx} />
  }
}

/** Alerts, nudges, proposals and the weekly review: an insight with Got it / Approve and Dismiss. */
function InsightRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'alert' | 'nudge' | 'plan' | 'review' }>; ctx: RowCtx }) {
  const i = item.insight
  const hasActions = (i.actions?.length ?? 0) > 0
  const goalReview = item.kind === 'review' && (i.review?.goals?.length ?? 0) > 0
  const area = i.meta?.split(' · ')[0]
  const accept = () => ctx.act(i.id, hasActions ? `${i.actions![0].name} added to your routines` : 'Noted', () => resolveInsight(i.id, 'accept'))
  const dismiss = () => ctx.act(i.id, `Dismissed: ${sentenceCase(i.title)}`, () => resolveInsight(i.id, 'dismiss'), () => restoreInsight(i.id))
  const connection = ctx.connections?.[item.id]
  return (
    <QueueItem
      kind={item.kind} picture={queuePicture(item)} title={sentenceCase(i.title)}
      line={item.kind === 'review' ? undefined : lead(i.body) || undefined}
      label={<>{when(i.at, ctx)}{area ? <> <span aria-hidden>·</span> {area}</> : null}</>}
      quick={!hasActions && !goalReview && item.kind !== 'review' ? <Button size="sm" onClick={accept}>Got it</Button> : undefined}
      actions={
        <>
          {goalReview ? (
            <Link href="/plan/review" className={buttonClass({ variant: 'primary', size: 'sm' })}>Start review</Link>
          ) : (
            <Button size="sm" variant={hasActions ? 'primary' : 'secondary'} onClick={accept}><Check className="size-4" strokeWidth={2} aria-hidden />{hasActions ? 'Approve' : 'Got it'}</Button>
          )}
          <Button size="sm" variant="quiet" onClick={dismiss}>{item.kind === 'review' ? 'Later' : 'Dismiss'}</Button>
          {item.kind === 'review' ? <ShareButton kind="weekly" refId={reviewedWeekStart(i.reviewOn ?? localDate(new Date(i.at), ctx.timezone))} label="Share your week">Share your week</ShareButton> : <Why id={i.id} />}
          {hasActions ? <span className="text-small text-ink-3 sm:ml-auto">Nothing changes until you approve.</span> : null}
        </>
      }
    >
      {item.kind === 'review' && i.review ? (
        <details className="group/review">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-[rotate] duration-150 ease-out-quint group-open/review:rotate-90" strokeWidth={1.5} aria-hidden />Read the review
          </summary>
          <div className="pt-2"><InsightBody body={i.body} review={i.review} kind={i.kind} /></div>
        </details>
      ) : <InsightBody body={i.body} review={i.review} kind={i.kind} />}
      {connection ? <div className="mt-3 rounded-md bg-surface-2 p-4">{connection}</div> : null}
      {hasActions ? <ActionPreview actions={i.actions!} /> : null}
    </QueueItem>
  )
}

function RecoveryRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'recovery' }>; ctx: RowCtx }) {
  const closed = !item.recovery
  return (
    <QueueItem
      kind="recovery" picture={queuePicture(item)} title={sentenceCase(item.insight.title)}
      line={closed ? 'closed' : 'closes at midnight'} defaultOpen={!closed}
    >
      {closed ? (
        <p className="text-body text-ink-2 text-pretty">This choice was for a day that has passed. It closes by itself. New quests were paused for that day only.</p>
      ) : (
        <>
          <p className="mb-3 text-body text-ink-2 text-pretty">Pick how to come back. Nothing is penalised.</p>
          <RecoveryChoices recovery={item.recovery!} onChosen={(c) => ctx.done(item.id, RECOVERY_DONE[c])} />
        </>
      )}
    </QueueItem>
  )
}

function GoalDraftRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'goal-draft' }>; ctx: RowCtx }) {
  const d = item.draft
  const g = ctx.goal
  const atCap = !!g && g.activeCount >= 3
  const m = d.measure
  const unit = 'tracker' in m ? null : m.unit ?? null
  const review = g ? (
    <GoalFormButton variant="primary" size="sm" mode={{ kind: 'draft', activeCount: g.activeCount, insightId: item.id, packName: d.origin ? d.origin.name ?? 'starter' : undefined }} initial={initialFromDraft(d, g.picker, g.today)} picker={g.picker} today={g.today} disabled={atCap}>Review draft</GoalFormButton>
  ) : <Link href="/plan" className={buttonClass({ variant: 'primary', size: 'sm' })}>Review draft</Link>
  const target = `${targetText({ direction: d.direction, target: d.target ?? null, rangeLow: d.rangeLow ?? null, rangeHigh: d.rangeHigh ?? null, unit })} by ${formatDay(d.targetDate, { day: 'numeric', month: 'short' })}`
  return (
    <QueueItem
      kind="goal-draft" picture={queuePicture(item)} title={sentenceCase(d.title)} line={target} label={when(item.at, ctx)}
      quick={review}
      actions={
        <>
          {review}
          <Button size="sm" variant="quiet" onClick={() => ctx.act(item.id, `Dismissed: ${sentenceCase(d.title)}`, () => dismissGoalDraftAction(item.id), () => restoreInsight(item.id))}>Dismiss</Button>
        </>
      }
    >
      <p className="text-body text-ink-2 text-pretty">{d.reason}</p>
      <p className="mt-1 text-small text-ink-3 tabular-nums">You set the baseline when you start it.</p>
      {atCap ? <p className="mt-1 text-small text-ink-3">You have 3 active goals. Pause or finish one to start this.</p> : null}
    </QueueItem>
  )
}

/** Someone on this server asked you into a party. Join opens the share picker (name and level only to start); nothing of theirs is shown here. */
function PartyInviteRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'party-invite' }>; ctx: RowCtx }) {
  const [joining, setJoining] = useState(false)
  const join = <Button size="sm" variant="primary" onClick={() => setJoining(true)}>Join</Button>
  return (
    <QueueItem
      kind="party-invite" picture={queuePicture(item)} label={when(item.at, ctx)} title={`${item.from ?? 'Someone'} asked you to join ${item.party}`}
      line={`${item.members} ${item.members === 1 ? 'person is' : 'people are'} in so far`}
      quick={join}
      extra={<AcceptPartyDialog invite={joining ? { partyId: item.id, party: item.party, from: item.from } : null} onClose={() => setJoining(false)} onAnswered={() => ctx.done(item.id, `Joined ${item.party}`)} />}
      actions={
        <>
          {join}
          <Button size="sm" variant="quiet" onClick={() => ctx.act(item.id, `Declined ${item.party}`, async () => { const r = await declinePartyInvite(item.id); if (!r.ok) throw new Error(r.error) })}>Decline</Button>
        </>
      }
    >
      <p className="text-body text-ink-2 text-pretty">A party is a few people on this server who show up together. You choose what they can see, and you can leave at any time.</p>
    </QueueItem>
  )
}

function UnreadRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'unread' }>; ctx: RowCtx }) {
  const s = item.summary
  const toast = useToast()
  const [pending, start] = useTransition()
  const retry = () => start(async () => {
    try {
      const r = await retryRawEvents(item.rawEventIds)
      if (r.parsed) ctx.done(item.id, 'Read and saved')
      else toast('Still can’t read it', 'neutral', { description: 'Nothing changed' })
    } catch { toast.error() }
  })
  return (
    <QueueItem
      kind="unread" fixed picture={queuePicture(item)} line={<>{s.title} <span aria-hidden>·</span> {when(item.at, ctx)}</>} busy={pending}
      title={s.amount ? <>A payment message {brand.name} couldn’t read <span className="font-normal text-ink-3 tabular-nums">· {formatMoney(s.amount.value, s.amount.currency)}</span></> : `A message ${brand.name} couldn’t read`}
      aside={
        <>
          <Button size="sm" disabled={pending} onClick={retry}><RefreshCw className={cn('size-3.5', pending && 'animate-spin motion-reduce:animate-none')} strokeWidth={1.5} aria-hidden />{pending ? 'Trying…' : 'Retry'}</Button>
          <Button size="sm" variant="quiet" disabled={pending} onClick={() => ctx.act(item.id, 'Ignored', () => ignoreRawEvent(item.rawEventIds[0]))}>Ignore</Button>
        </>
      }
    >
      {s.items?.length ? (
        <ul className="mb-2 flex min-w-0 flex-wrap gap-1.5" aria-label="Items">
          {s.items.map((it, n) => <li key={n} className="h-6 max-w-full truncate rounded-sm bg-surface-2 px-2.5 text-caption leading-6 text-ink-2" title={it}>{it}</li>)}
          {s.more ? <li className="flex h-6 items-center px-1 text-caption text-ink-3">+{s.more} more</li> : null}
        </ul>
      ) : null}
      {s.text ? <p className="truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-caption text-ink-2">{s.text}</p> : null}
      <p className="mt-2.5 flex items-start gap-1.5 text-small leading-snug text-bad-ink"><CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />{item.reason}</p>
      <details className="group/raw mt-1">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-sm text-small text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-[rotate] duration-150 ease-out-quint group-open/raw:rotate-90" strokeWidth={1.5} aria-hidden />Original message
        </summary>
        <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-caption leading-relaxed break-words whitespace-pre-wrap text-ink-2">{item.original}</pre>
      </details>
    </QueueItem>
  )
}

const CHIPS = 5

/** One tap files a merchant: chips for the user's most used categories, More for the rest, and whether to remember it. */
function CategoriseRow({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'categorise' }>; ctx: RowCtx }) {
  const [remember, setRemember] = useState(true)
  const toast = useToast()
  const top = ctx.categories.slice(0, CHIPS)
  const more = ctx.categories.slice(CHIPS)
  const file = (category: string) => {
    // Undo waits for the filing to land, so a fast Undo cannot run before there is anything to take back.
    const saved: { done?: ReturnType<typeof recategorize> } = {}
    ctx.act(
      item.id, `${item.merchant} filed under ${category}${remember ? ' · remembered' : ''}`,
      async () => { saved.done = recategorize(item.sampleTxnId, category, remember); await saved.done },
      async () => { if (saved.done) await undoRecategorize(await saved.done) },
    )
  }
  return (
    <QueueItem
      kind="categorise" fixed picture={queuePicture(item)} title={item.merchant}
      line={<span className="tabular-nums">{item.count} {item.count === 1 ? 'payment' : 'payments'} <span aria-hidden>·</span> {formatMoney(item.total, item.currency)} <span aria-hidden>·</span> {when(item.at, ctx)}</span>}
      actions={
        <div className="flex w-full flex-col gap-3">
          <div role="group" aria-label={`Category for ${item.merchant}`} className="flex flex-wrap gap-2">
            {top.map((c) => (
              <button
                key={c} type="button" onClick={() => file(c)}
                className={buttonClass({ variant: 'secondary', size: 'sm', className: 'font-normal text-ink-2 hover:text-ink' })}
              >{c}</button>
            ))}
            {more.length ? (
              <Select
                variant="pill" aria-label={`More categories for ${item.merchant}`} value="" className="max-w-full"
                onChange={(e) => { if (e.target.value) file(e.target.value) }}
              >
                <option value="">More…</option>
                {more.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            ) : null}
          </div>
          <Checkbox
            checked={remember} onCheckedChange={(v) => { setRemember(v); if (!v) toast('Only this payment will move', 'neutral') }}
            label={`Remember for ${item.merchant}`} className="text-small text-ink-2"
          />
        </div>
      }
    />
  )
}
