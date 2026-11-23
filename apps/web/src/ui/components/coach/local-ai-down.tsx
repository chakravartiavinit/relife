import { ServerOff } from 'lucide-react'
import { Cmd, LOCAL_AI_DOWN, RecheckLocalAi } from '../local-ai-check'

/** The free local model is chosen but its server isn't answering: the fix, then "Check again". Asking is off until it is. */
export function LocalAiDown({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-warn/14 text-warn"><ServerOff className="size-4" strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink text-pretty">{LOCAL_AI_DOWN}</h3>
          <p role="status" className="mt-1 text-small text-ink-2 text-pretty"><Cmd text={message} /></p>
          <p className="mt-1 text-small text-ink-3">Alerts, patterns and quests keep running on rules in the meantime.</p>
          <div className="mt-4"><RecheckLocalAi /></div>
        </div>
      </div>
    </div>
  )
}
