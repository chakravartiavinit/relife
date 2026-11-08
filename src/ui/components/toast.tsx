'use client'

import { celebrateAchievement, celebrateLevel } from './celebrate'
import { createContext, useContext, useMemo } from 'react'
import { AnimatedToastStack, useAnimatedToastStack, type ToastStatus } from '@/ui/beui/motion/animated-toast-stack'

type Tone = 'good' | 'bad' | 'neutral'
const STATUS: Record<Tone, ToastStatus> = { good: 'success', bad: 'error', neutral: 'neutral' }

/**
 * `toast(text, tone)` for one-shot messages.
 * `toast.loading(text)` returns an id; `toast.update(id, text, tone)` morphs it in place
 * (spinner → check), so a long action reads as one notification, not two.
 */
export type Notify = ((text: string, tone?: Tone) => void) & {
  loading: (text: string) => string
  update: (id: string, text: string, tone?: Tone) => void
  /** A fuller toast: a second line, an icon, one action, a custom duration. */
  show: (t: { title: string; description?: string; tone?: Tone; icon?: React.ReactNode; action?: { label: string; onClick: () => void }; duration?: number }) => void
}

const noop = Object.assign(() => {}, { loading: () => '', update: () => {}, show: () => {} }) as Notify
const Ctx = createContext<Notify>(noop)
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, showToast, updateToast, dismissToast } = useAnimatedToastStack({ defaultDuration: 3200, limit: 3 })

  const notify = useMemo(() => Object.assign(
    (text: string, tone: Tone = 'neutral') => { showToast({ title: text, status: STATUS[tone] }) },
    {
      loading: (text: string) => showToast({ title: text, status: 'loading', duration: 0, dismissible: false }),
      update: (id: string, text: string, tone: Tone = 'good') =>
        updateToast(id, { title: text, status: STATUS[tone], duration: 3200, dismissible: true }),
      show: ({ tone = 'neutral', action, ...t }: Parameters<Notify['show']>[0]) =>
        void showToast({ ...t, status: STATUS[tone], action: action && { label: action.label, onClick: () => action.onClick() } }),
    },
  ) as Notify, [showToast, updateToast])

  return (
    <Ctx.Provider value={notify}>
      {children}
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-center"
        fixed
        maxVisible={3}
        classNames={{
          // Above the phone tab bar; shadows instead of a border, ReLife radius.
          // z-[75]: above pop-ups (chests, setup) so their errors and level-ups stay readable.
          root: 'bottom-24 z-[75] lg:bottom-6',
          surface: 'rounded-lg border-0 bg-surface/95 p-2.5 pr-3 shadow-3',
          title: 'text-[13.5px] font-medium text-ink',
        }}
      />
    </Ctx.Provider>
  )
}

type XpNews = import('@/core/xp').XpNews | undefined | void

/**
 * Level-ups and achievements play their own animations (celebrate.tsx); quest chests get a toast.
 * Quiet when nothing changed.
 */
export function announceXp(toast: Notify, news: XpNews) {
  if (!news) return
  for (const a of news.unlocked) celebrateAchievement(a)
  // The level-up screen goes last so it sits over the banners.
  if (news.levelUp) setTimeout(() => celebrateLevel(news.levelUp!), news.unlocked.length ? 900 : 0)
  if (news.chests) toast(news.chests === 1 ? 'Quest complete. A chest is waiting on Today' : `${news.chests} quests complete. Chests are waiting on Today`, 'good')
}
