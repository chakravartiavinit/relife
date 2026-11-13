'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Activity, Droplets, Flame, Heart, Home, Moon, Pause, Trash2, Check } from 'lucide-react'
import { peekFromSearch, type PeekRef } from '@/domain/peek'
import { AdaptiveStepper, AdaptiveStepperDecrement, AdaptiveStepperIncrement, AdaptiveStepperValue } from '@/ui/beui/motion/adaptive-stepper'
import { AnimatedBadge } from '@/ui/beui/motion/animated-badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/ui/beui/motion/breadcrumb'
import { StatefulButton, type ButtonState } from '@/ui/beui/motion/button/stateful'
import { Checkbox } from '@/ui/beui/motion/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleIndicator, CollapsibleTrigger } from '@/ui/beui/motion/collapsible'
import { Input as BeuiInput } from '@/ui/beui/motion/input'
import { SwipeableList } from '@/ui/beui/motion/swipeable-list'
import { ApprovalCard } from '@/ui/beui/agents/approval-card'
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageScroller, MessageTyping } from '@/ui/beui/agents/message'
import { PromptInput } from '@/ui/beui/agents/prompt-input'
import {
  AnimatedSidebar, AnimatedSidebarContent, AnimatedSidebarFooter, AnimatedSidebarGroup, AnimatedSidebarGroupContent, AnimatedSidebarMenu,
  AnimatedSidebarMenuButton, AnimatedSidebarMenuItem, AnimatedSidebarMenuSub, AnimatedSidebarMenuSubButton, AnimatedSidebarMenuSubItem,
  AnimatedSidebarProvider, useAnimatedSidebar,
} from '@/ui/beui/motion/animated-sidebar'
import { Button } from './button'
import { PeekLink } from './peek/peek-link'
import { SegmentTabs } from './segment-tabs'
import { Sheet } from './sheet'
import { AvatarRing } from './shell/avatar-ring'
import { CoachBell, CountPill } from './shell/coach-bell'
import { SyncDot } from './shell/sync-dot'

/** A labelled cell, so every sample says what it is. */
function Demo({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 text-small text-ink-2">{title}</div>
      {children}
    </div>
  )
}

const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-8 lg:grid-cols-2">{children}</div>

/** The type scale, one row per token. Each line is the real class, so it follows the tokens. */
export function TypeScale() {
  const rows: [string, string, string][] = [
    ['text-display font-display', 'display 34/40', 'Good morning, Avinit'],
    ['text-title font-display', 'title 24/30', 'Today’s plan'],
    ['text-heading', 'heading 17/24', 'Sleep this week'],
    ['text-body', 'body 14/20', 'Six of sixteen routines done.'],
    ['text-small', 'small 13/18', 'Water is 500 ml behind pace.'],
    ['text-caption', 'caption 12/16', 'Updated 2 minutes ago'],
    ['text-label font-mono uppercase', 'label 11/14 mono', 'Health · Today'],
  ]
  return (
    <div className="flex flex-col divide-y divide-divider">
      {rows.map(([cls, name, sample]) => (
        <div key={name} className="flex items-baseline gap-4 py-3">
          <code className="w-44 shrink-0 text-caption text-ink-3">{name}</code>
          <span className={`${cls} min-w-0 truncate text-ink`}>{sample}</span>
        </div>
      ))}
      <div className="flex items-baseline gap-4 py-3">
        <code className="w-44 shrink-0 text-caption text-ink-3">num</code>
        <span className="num text-title text-ink">₹12,480 · 7.2 h</span>
      </div>
    </div>
  )
}

/** Sheet: a bottom sheet on a phone, a right panel on a laptop. */
export function SheetDemo() {
  const [open, setOpen] = useState<'panel' | 'modal' | null>(null)
  const body = (
    <div className="flex flex-col gap-4 pb-2">
      <p className="text-body text-ink-2">Anything can go here. Esc closes it, and focus returns to the button that opened it.</p>
      <BeuiInput label="Focus lands here first" placeholder="Try typing" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="rounded-md bg-surface-2 px-3 py-2.5 text-small text-ink-2">Row {i + 1}: the body scrolls, the header stays.</div>)}
      </div>
    </div>
  )
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setOpen('panel')}>Open (non-modal on a laptop)</Button>
      <Button onClick={() => setOpen('modal')}>Open modal</Button>
      <p className="text-small text-ink-3">Laptop: a 440px panel, the page stays usable. Phone: a bottom sheet with half and full detents.</p>
      <Sheet open={open === 'panel'} onOpenChange={(o) => setOpen(o ? 'panel' : null)} title="Sheet" description="Non-modal on a laptop, a bottom sheet on a phone">{body}</Sheet>
      <Sheet open={open === 'modal'} onOpenChange={(o) => setOpen(o ? 'modal' : null)} title="Modal sheet" description="Dims the page and holds focus" modal>{body}</Sheet>
    </div>
  )
}

/** Route tabs with a fake pathname, since /dev/ui has no sub-routes. */
export function SegmentTabsDemo() {
  const [path, setPath] = useState('/plan/routines')
  const [wide, setWide] = useState('/health/trends')
  return (
    <div className="flex flex-col gap-5">
      <SegmentTabs label="Plan demo" pathname={path} onNavigate={setPath} tabs={[
        { href: '/plan', label: 'Goals' }, { href: '/plan/routines', label: 'Routines' }, { href: '/plan/trackers', label: 'Trackers' }, { href: '/plan/review', label: 'Review' },
      ]} />
      <div className="w-full max-w-[320px]">
        <div className="mb-2 text-small text-ink-2">Too wide for 320px: scrolls sideways</div>
        <SegmentTabs label="Area demo" pathname={wide} onNavigate={setWide} tabs={[
          { href: '/health', label: 'Overview' }, { href: '/health/trends', label: 'Trends' }, { href: '/health/routines', label: 'Routines' }, { href: '/health/sources', label: 'Sources' }, { href: '/health/history', label: 'History' },
        ]} />
      </div>
    </div>
  )
}

function PeekReadout() {
  const sp = useSearchParams()
  const ref = peekFromSearch(sp.toString())
  return <code className="rounded-sm bg-surface-2 px-2 py-1 text-caption text-ink-2">{ref ? `peek = ${ref.type}:${ref.id}` : 'no peek open'}</code>
}

export function PeekLinkDemo() {
  const refs: [string, PeekRef][] = [
    ['Sleep (metric)', { type: 'metric', id: 'sleep.hours' }],
    ['Water (metric)', { type: 'metric', id: 'water' }],
    ['Big Basket (merchant)', { type: 'merchant', id: 'Big Basket & Co' }],
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {refs.map(([label, to]) => (
          <PeekLink key={label} to={to} className="inline-flex h-10 items-center rounded-md bg-surface-2 px-3.5 text-body font-medium text-ink transition-[background-color,scale] duration-150 hover:bg-surface-3 active:scale-96">{label}</PeekLink>
        ))}
      </div>
      <div className="flex items-center gap-3 text-small text-ink-3">
        <Suspense fallback={<code className="text-caption">…</code>}><PeekReadout /></Suspense>
        Clicking swaps the URL without a server trip. Middle-click opens it in a new tab. Back closes it.
      </div>
    </div>
  )
}

/** The shell's status pieces in each state: the sync dot, the Coach count, the level avatar and an area dot. */
export function ShellDemo() {
  const dot = (status: 'done' | 'due' | 'none') => (
    <span aria-hidden className={`size-1.5 rounded-full ${status === 'none' ? 'opacity-30' : ''}`} style={{ background: status === 'due' ? 'transparent' : 'var(--cat-health)', boxShadow: status === 'due' ? 'inset 0 0 0 1.5px var(--cat-health)' : undefined }} />
  )
  return (
    <Grid>
      <Demo title="SyncDot (good, warn, bad, loading)">
        <div className="flex flex-wrap items-center gap-2">
          <SyncDot tone="good" label="Synced 2 min ago" />
          <SyncDot tone="warn" label="2 need a fix" />
          <SyncDot tone="bad" label="Sync paused 2 h" />
          <SyncDot tone="loading" />
        </div>
      </Demo>
      <Demo title="CoachBell and CountPill (0, 4, 120)">
        <div className="flex items-center gap-4">
          <CoachBell /><CoachBell count={4} /><CoachBell count={120} />
          <CountPill n={4} /><CountPill n={120} />
        </div>
      </Demo>
      <Demo title="AvatarRing (loading, level 1, level 12 at 62%, level 24 at 100%)">
        <div className="flex items-center gap-4">
          <AvatarRing initial="R" />
          <AvatarRing initial="A" level={1} progress={0.02} />
          <AvatarRing initial="A" level={12} progress={0.62} />
          <AvatarRing initial="A" level={24} progress={1} />
        </div>
      </Demo>
      <Demo title="Area dot (filled: all done, ring: something due, faint: nothing due)">
        <div className="flex items-center gap-4 text-small text-ink-2"><span className="flex items-center gap-2">{dot('done')}Health</span><span className="flex items-center gap-2">{dot('due')}Mind</span><span className="flex items-center gap-2">{dot('none')}Wealth</span></div>
      </Demo>
    </Grid>
  )
}

function SidebarDemoNav() {
  const { open, toggleSidebar } = useAnimatedSidebar()
  const [life, setLife] = useState(true)
  return (
    <>
      <AnimatedSidebarContent className="gap-1 px-2">
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupContent>
            <AnimatedSidebarMenu>
              <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Home className="size-4" strokeWidth={1.5} />} href="#" isActive>Today</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton icon={<Heart className="size-4" strokeWidth={1.5} />} ariaExpanded={life} onSelect={() => setLife((v) => !v)}>Life</AnimatedSidebarMenuButton>
                <AnimatedSidebarMenuSub open={life}>
                  {['Health', 'Mind', 'Wealth'].map((a) => <AnimatedSidebarMenuSubItem key={a}><AnimatedSidebarMenuSubButton href="#">{a}</AnimatedSidebarMenuSubButton></AnimatedSidebarMenuSubItem>)}
                </AnimatedSidebarMenuSub>
              </AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Activity className="size-4" strokeWidth={1.5} />} href="#" badge={<span className="rounded-full bg-pill px-1.5 text-caption text-white tabular-nums">4</span>}>Coach</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
            </AnimatedSidebarMenu>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter><Button size="sm" onClick={toggleSidebar}>{open ? 'Collapse to rail' : 'Expand'}</Button></AnimatedSidebarFooter>
    </>
  )
}

const SAMPLE_SWIPE = [
  { id: 'a', title: 'Night skincare', description: '21:30 · Health', leading: <Moon className="size-4" strokeWidth={1.5} />, leftActions: [{ id: 'done', label: 'Done', icon: <Check className="size-4" />, tone: 'success' as const }], rightActions: [{ id: 'skip', label: 'Skip', icon: <Pause className="size-4" />, tone: 'warning' as const }] },
  { id: 'b', title: 'Drink water', description: '12 glasses · Health', leading: <Droplets className="size-4" strokeWidth={1.5} />, leftActions: [{ id: 'done', label: 'Done', icon: <Check className="size-4" />, tone: 'success' as const }], rightActions: [{ id: 'del', label: 'Remove', icon: <Trash2 className="size-4" />, tone: 'danger' as const }] },
]

export function InstalledBeuiGallery() {
  const [checked, setChecked] = useState(true)
  const [btn, setBtn] = useState<ButtonState>('idle')
  const [email, setEmail] = useState('')
  const [water, setWater] = useState(750)
  const [last, setLast] = useState<string>('Swipe a row on a phone, or drag it with the mouse.')
  const run = () => { setBtn('loading'); setTimeout(() => setBtn('success'), 1200); setTimeout(() => setBtn('idle'), 3000) }
  return (
    <Grid>
      <Demo title="Checkbox">
        <div className="flex flex-col gap-1">
          <Checkbox checked={checked} onCheckedChange={setChecked} label="Night skincare" description="21:30 · Health" />
          <Checkbox checked={false} onCheckedChange={() => {}} label="Unchecked" />
          <Checkbox checked indeterminate onCheckedChange={() => {}} label="Some of them" />
          <Checkbox checked disabled onCheckedChange={() => {}} label="Disabled" />
        </div>
      </Demo>
      <Demo title="AdaptiveStepper (water in ml, 250 steps)">
        <AdaptiveStepper value={water} onValueChange={setWater} min={0} max={3000} step={250} aria-label="Water in millilitres">
          <AdaptiveStepperDecrement aria-label="Less water" />
          <AdaptiveStepperValue>{(v) => v}</AdaptiveStepperValue>
          <AdaptiveStepperIncrement aria-label="More water" />
        </AdaptiveStepper>
      </Demo>
      <Demo title="AnimatedBadge (sync status)">
        <div className="flex flex-wrap gap-2">
          <AnimatedBadge status="success" icon={<Check className="size-3" />}>Synced 2 min ago</AnimatedBadge>
          <AnimatedBadge status="warning" pulse>2 need a fix</AnimatedBadge>
          <AnimatedBadge status="danger">Sync paused 2 h</AnimatedBadge>
          <AnimatedBadge status="loading">Syncing</AnimatedBadge>
          <AnimatedBadge status="neutral" size="md">Neutral</AnimatedBadge>
        </div>
      </Demo>
      <Demo title="StatefulButton (idle, loading, success, error)">
        <div className="flex flex-wrap items-center gap-3">
          <StatefulButton state={btn} onClick={run} loadingText="Checking…" successText="Connected" errorText="Try again">Check key</StatefulButton>
          <Button size="sm" onClick={() => setBtn('error')}>Show error</Button>
        </div>
      </Demo>
      <Demo title="Collapsible">
        <Collapsible defaultOpen className="rounded-lg bg-surface-2">
          <CollapsibleTrigger className="flex min-h-10 w-full items-center justify-between px-3 text-body font-medium text-ink">
            6 done <CollapsibleIndicator />
          </CollapsibleTrigger>
          <CollapsibleContent><p className="px-3 pb-3 text-small text-ink-2">Morning skincare, water, vitamins, stretch, read, journal.</p></CollapsibleContent>
        </Collapsible>
      </Demo>
      <Demo title="Input (error shake, success check)">
        <div className="flex flex-col gap-3">
          <BeuiInput label="Email" value={email} onChange={setEmail} error={email && !email.includes('@') ? 'Needs an @' : undefined} success={email.includes('@')} placeholder="you@example.com" reserveErrorLine />
          <BeuiInput label="Disabled" defaultValue="Read only" disabled />
        </div>
      </Demo>
      <Demo title="Breadcrumb">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem key="life"><BreadcrumbLink href="#">Life</BreadcrumbLink><BreadcrumbSeparator /></BreadcrumbItem>
            <BreadcrumbItem key="wealth"><BreadcrumbLink href="#">Wealth</BreadcrumbLink><BreadcrumbSeparator /></BreadcrumbItem>
            <BreadcrumbItem key="spending"><BreadcrumbPage>Spending</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Demo>
      <Demo title="SwipeableList">
        <div className="max-w-[420px]">
          <SwipeableList items={SAMPLE_SWIPE} onAction={({ item, action }) => setLast(`${action.label}: ${item.title}`)} />
          <p className="mt-2 text-small text-ink-3">{last}</p>
        </div>
      </Demo>
      <Demo title="ApprovalCard (a recovery choice)" className="lg:col-span-2">
        <div className="max-w-[560px]">
          <ApprovalCard
            title="Missed Push 4 commits yesterday"
            description="Pick a way back. Nothing is penalised."
            questions={[{ id: 'path', title: 'What would help?', options: [
              { value: 'smaller', label: 'A smaller step', description: 'Push 1 commit today' }, { value: 'rest', label: 'Rest day' }, { value: 'priorities', label: 'Change priorities' }] }]}
            onSubmit={() => {}}
            submitLabel="Choose"
          />
        </div>
      </Demo>
      <Demo title="Message, MessageScroller, PromptInput (Coach Ask)" className="lg:col-span-2">
        <div className="flex h-[360px] max-w-[560px] flex-col gap-3 rounded-lg bg-surface-2 p-3">
          <MessageScroller className="min-h-0 flex-1" label="Ask thread">
            <MessageGroup>
              <Message from="user"><MessageContent><div className="rounded-lg bg-pill-wash px-3 py-2 text-body text-ink">How did I sleep this week?</div></MessageContent></Message>
              <Message from="assistant">
                <MessageAvatar><Flame /></MessageAvatar>
                <MessageContent><div className="rounded-lg bg-surface px-3 py-2 text-body text-ink shadow-1">You averaged 7.2 h, 24 minutes more than last week. Thursday was the short one.</div></MessageContent>
              </Message>
              <Message from="assistant"><MessageAvatar><Flame /></MessageAvatar><MessageContent><MessageTyping label="Reading your data" /></MessageContent></Message>
            </MessageGroup>
          </MessageScroller>
          <PromptInput placeholder="Ask about your data…" onSubmit={() => {}} minRows={1} />
        </div>
      </Demo>
      <Demo title="AnimatedSidebar (expanded and rail, nested Life; a phone gets a slide-over instead)" className="max-md:hidden lg:col-span-2">
        <AnimatedSidebarProvider defaultOpen className="h-[340px] min-h-0 max-w-[560px] overflow-hidden rounded-lg bg-surface-2" style={{ '--sidebar-width': '220px', '--sidebar-width-icon': '64px' }}>
          <AnimatedSidebar collapsible="icon" ariaLabel="Demo sidebar" panelClassName="h-[340px] bg-surface-2 border-0">
            <SidebarDemoNav />
          </AnimatedSidebar>
        </AnimatedSidebarProvider>
      </Demo>
    </Grid>
  )
}
