'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { saveTheme } from '@/app/actions'
import { Button } from './button'

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})()`

export type ThemeChoice = 'light' | 'dark' | 'system'

/**
 * Set the theme without every transition firing at once (suppress, reflow, restore). "system" follows the OS.
 * The choice is also saved on the server (the same look on every device) unless `save` is false.
 */
export function applyTheme(choice: ThemeChoice, { save = true }: { save?: boolean } = {}) {
  const next = choice === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.appendChild(style)
  document.documentElement.dataset.theme = next
  // EvilCharts (shadcn) picks its dark colours with a .dark class; ReLife's own styles read data-theme.
  document.documentElement.classList.toggle('dark', next === 'dark')
  if (choice === 'system') localStorage.removeItem('theme')
  else localStorage.setItem('theme', choice)
  void document.body.offsetHeight
  requestAnimationFrame(() => style.remove())
  window.dispatchEvent(new Event('relife:theme'))
  if (save) void saveTheme(choice).catch(() => {}) // the localStorage copy still applies if the server is away
}

/** On load the server's choice wins when it differs from this browser's copy; with none saved yet, this browser's choice is uploaded. */
export function ThemeSync({ theme }: { theme: ThemeChoice | null }) {
  useEffect(() => {
    const local = (localStorage.getItem('theme') as ThemeChoice | null) ?? 'system'
    if (theme && theme !== local) applyTheme(theme, { save: false })
    else if (!theme && local !== 'system') void saveTheme(local).catch(() => {})
  }, [theme])
  return null
}

export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      onClick={() => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')}
    >
      {/* Both icons stay in the DOM; CSS picks one per theme, so there is no hydration mismatch. */}
      <Sun className="size-[18px] dark:hidden" strokeWidth={1.5} />
      <Moon className="hidden size-[18px] dark:block" strokeWidth={1.5} />
    </Button>
  )
}
