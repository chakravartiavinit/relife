'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from './button'

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`

/** Flip theme without every transition firing at once (suppress, reflow, restore). */
function applyTheme(next: 'light' | 'dark') {
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.appendChild(style)
  document.documentElement.dataset.theme = next
  localStorage.setItem('theme', next)
  void document.body.offsetHeight
  requestAnimationFrame(() => style.remove())
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
