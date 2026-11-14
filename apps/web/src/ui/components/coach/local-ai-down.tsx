import { ServerOff } from 'lucide-react'
import { Card } from '../card'
import { Cmd, LOCAL_AI_DOWN, RecheckLocalAi } from '../local-ai-check'

/** The free local model is chosen but its server isn't answering: the fix, then "Check again". Asking is off until it is. */
export function LocalAiDown({ message }: { message: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-warn/14 text-warn"><ServerOff className="size-4" strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <h2 className="text-heading font-semibold text-ink text-pretty">{LOCAL_AI_DOWN}</h2>
          <p role="status" className="mt-1.5 text-body text-ink-2 text-pretty"><Cmd text={message} /></p>
          <p className="mt-1 text-small text-ink-3">Alerts, patterns and quests keep running on rules in the meantime.</p>
          <div className="mt-4"><RecheckLocalAi /></div>
        </div>
      </div>
    </Card>
  )
}
