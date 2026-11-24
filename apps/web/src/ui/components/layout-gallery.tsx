'use client'

import { useState } from 'react'
import { Brain, Plus } from 'lucide-react'
import { CapsuleIcon } from './capsule-icon'
import { LevelBar } from './capsule'
import { Button } from './button'
import { Card, PageHeader, SectionLabel } from './card'
import { Fold } from './fold'
import { GridItem, PageGrid } from './page-grid'
import { Rail } from './rail'
import { SegmentTabs } from './segment-tabs'

// The shared layout pieces, each shown at the three page widths (a container query reacts to the box it is in, so the
// boxes stand in for a laptop, a tablet and a phone). Toggle the theme in the sidebar to see both.

const WIDTHS = [
  { label: 'Laptop, 12 columns (about 1000px of page)', className: 'w-full max-w-[1000px]' },
  { label: 'Tablet, 8 columns (704px)', className: 'w-full max-w-[704px]' },
  { label: 'Phone, 1 column (350px)', className: 'w-full max-w-[350px]' },
]

function Widths({ children }: { children: (width: string) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      {WIDTHS.map((w) => (
        <div key={w.label}>
          <div className="mb-2 text-small text-ink-2">{w.label}</div>
          <div className={`${w.className} rounded-md bg-bg p-4 shadow-[inset_0_0_0_1px_var(--divider)]`}>{children(w.label)}</div>
        </div>
      ))}
    </div>
  )
}

const Block = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <Card className={`flex min-h-16 items-center justify-center text-small text-ink-2 ${className ?? ''}`}>{children}</Card>
)

export function PageGridDemo() {
  return (
    <Widths>
      {() => (
        <PageGrid>
          <GridItem span={{ base: 12, lg: 8 }}><Block className="h-full">span base 12, lg 8</Block></GridItem>
          <GridItem span={{ base: 12, lg: 4 }}><Block className="h-full">span base 12, lg 4</Block></GridItem>
          <GridItem span={{ base: 4, lg: 4 }}><Block>base 4, lg 4</Block></GridItem>
          <GridItem span={{ base: 4, lg: 4 }}><Block>base 4, lg 4</Block></GridItem>
          <GridItem span={{ base: 8, lg: 4 }}><Block>base 8, lg 4</Block></GridItem>
        </PageGrid>
      )}
    </Widths>
  )
}

const TABS = [
  { href: '/health', label: 'Overview' }, { href: '/health/trends', label: 'Trends' },
  { href: '/health/routines', label: <span className="inline-flex items-baseline gap-1.5">Routines<span className="text-caption text-ink-3 tabular-nums">7</span></span> },
  { href: '/health/sources', label: <span className="inline-flex items-baseline gap-1.5">Sources<span className="text-caption text-ink-3 tabular-nums">2</span></span> },
]

function LevelSummary() {
  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <span className="num text-heading text-ink">Lv 21</span>
        <LevelBar value={0.71} color="var(--cat-health)" size="md" segments={20} label="Health level progress" className="flex-1" />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-caption text-ink-3 tabular-nums"><span className="truncate">461 XP to Lv 22</span><span className="shrink-0">7,605 XP</span></div>
    </div>
  )
}

export function PageHeaderDemo() {
  const [path, setPath] = useState('/health')
  return (
    <Widths>
      {() => (
        <PageHeader
          className="mb-0"
          eyebrow="Health" title="Health"
          capsule={<CapsuleIcon color="var(--cat-health)" icon={Brain} size="sm" className="ms-1" />}
          description={<>24 of 32 routines done this week. <a href="#" className="font-medium text-pill-ink hover-fine:underline">Why?</a></>}
          summary={<LevelSummary />}
          tabs={<SegmentTabs variant="underline" label="Health demo" tabs={TABS} pathname={path} onNavigate={setPath} />}
          actions={
            <Button variant="secondary" className="w-9 px-0 grid-md:w-auto grid-md:px-3.5">
              <Plus className="size-4" strokeWidth={2} aria-hidden /><span className="sr-only grid-md:not-sr-only">Log health</span>
            </Button>
          }
        />
      )}
    </Widths>
  )
}

export function PageHeaderPlainDemo() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="mb-0" title="Settings" eyebrow="Settings" description="A head with no summary and no tabs: the label, the title and one line." />
      <PageHeader className="mb-0" title="Devices" eyebrow="Settings" description="Actions without tabs sit in the head's right column." actions={<Button variant="secondary">Connect a device</Button>} />
    </div>
  )
}

export function RailDemo() {
  return (
    <Widths>
      {() => (
        <PageGrid>
          <GridItem span={{ base: 12, lg: 8 }}>
            <Card className="h-full"><SectionLabel as="div">A tall main card</SectionLabel><div className="mt-3 h-48 rounded-md bg-surface-2" /></Card>
          </GridItem>
          <Rail span={{ base: 12, lg: 4 }} pairs>
            <Card>Rail card</Card>
            <Card className="flex flex-col"><SectionLabel as="div">The last card grows</SectionLabel><span className="mt-2 text-small text-ink-3">So the rail ends level with the main card.</span></Card>
          </Rail>
        </PageGrid>
      )}
    </Widths>
  )
}

export function FoldDemo() {
  return (
    <Widths>
      {() => (
        <PageGrid>
          <GridItem className="flex flex-col gap-4">
            <Fold card title="Review due" summary="Weekly review · Sunday 22 Nov">
              <p className="text-body text-ink-2">The body, open: whatever the section holds.</p>
            </Fold>
            <Fold card title="Routines" summary="3 done · 2 to go" defaultOpen>
              <p className="text-body text-ink-2">Open by default. Only the chevron turns; nothing slides or fades.</p>
            </Fold>
            <Fold card inline title="Inline from the tablet tier" summary="Folded on a phone, plain content from 640px of page">
              <p className="text-body text-ink-2">A fold on the phone box, plain content on the wider ones.</p>
            </Fold>
            <Fold title="Without a card" summary="A bare fold sits on the page background">
              <p className="text-body text-ink-2">Body.</p>
            </Fold>
          </GridItem>
        </PageGrid>
      )}
    </Widths>
  )
}
