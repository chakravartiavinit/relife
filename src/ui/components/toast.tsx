'use client'

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
}

const noop = Object.assign(() => {}, { loading: () => '', update: () => {} }) as Notify
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
          root: 'bottom-24 lg:bottom-6',
          surface: 'rounded-lg border-0 bg-surface/95 p-2.5 pr-3 shadow-3',
          title: 'text-[13.5px] font-medium text-ink',
        }}
      />
    </Ctx.Provider>
  )
}
