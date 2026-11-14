'use client'

import { useEffect, useState } from 'react'
import { LogOut, UserPlus, Users } from 'lucide-react'
import { DEFAULT_PARTY_SHARE, PARTY_MAX_MEMBERS, type PartyShare } from '@relife/contract'
import { answerPartyInvite, changePartyShare, inviteToPartyAction, leavePartyAction, startParty } from '@/app/party-actions'
import type { PartyPerson } from '@/core/party'
import { Checkbox } from '@/ui/beui/motion/checkbox'
import { Button } from '../button'
import { Input } from '../form'
import { Dialog, FormError } from '../forms/dialog'
import { useToast } from '../toast'
import { SharePicker } from './share-picker'

type Done = () => void

/** Runs one party action: busy while it runs, the error shown in the dialog, `onOk` on success. */
function useAct(onOk: Done) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (call: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setPending(true); setError(null)
    const r = await call().catch(() => ({ ok: false as const, error: 'Something went wrong. Nothing was changed.' }))
    setPending(false)
    if (r.ok) onOk()
    else setError(r.error)
  }
  return { pending, error, act, clear: () => setError(null) }
}

/** “Start a party”: a name, people on this server to ask, and what you share. */
export function StartPartyDialog({ open, onClose, people }: { open: boolean; onClose: Done; people: PartyPerson[] }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [share, setShare] = useState<PartyShare>(DEFAULT_PARTY_SHARE)
  const { pending, error, act, clear } = useAct(() => { toast('Party started', 'good'); onClose() })
  useEffect(() => { if (open) { setName(''); setPicked([]); setShare(DEFAULT_PARTY_SHARE); clear() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)).slice(0, PARTY_MAX_MEMBERS - 1))
  return (
    <Dialog open={open} onClose={() => { if (!pending) onClose() }} icon={Users} color="var(--cat-relationships)" width="max-w-[480px]" title="Start a party" description="A few people who show up together. Each of you shares only what you tick.">
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void act(() => startParty({ name, invite: picked, share })) }}>
        <label className="flex flex-col gap-1.5 text-small font-medium text-ink">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Morning crew" required data-autofocus />
        </label>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-medium text-ink">Ask people on this server</legend>
          {people.length ? people.map((p) => (
            <Checkbox key={p.id} checked={picked.includes(p.id)} onCheckedChange={(on) => toggle(p.id, on)} label={p.name} />
          )) : <p className="text-small text-ink-3">Nobody else is on this server yet. The person who runs it can invite people in Settings → People on this server. You can still start a party now and ask them later.</p>}
        </fieldset>
        <div>
          <p className="mb-3 text-small font-medium text-ink">What you share</p>
          <SharePicker value={share} onChange={setShare} disabled={pending} />
        </div>
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>{pending ? 'Starting…' : 'Start party'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Accept an invitation: the share picker starts with name and level only. */
export function AcceptPartyDialog({ invite, onClose, onAnswered }: { invite: { partyId: string; party: string; from: string | null } | null; onClose: Done; onAnswered?: Done }) {
  const toast = useToast()
  const [share, setShare] = useState<PartyShare>(DEFAULT_PARTY_SHARE)
  const { pending, error, act, clear } = useAct(() => { toast('You’re in the party', 'good'); onAnswered?.(); onClose() })
  useEffect(() => { setShare(DEFAULT_PARTY_SHARE); clear() }, [invite?.partyId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!invite} onClose={() => { if (!pending) onClose() }} icon={Users} color="var(--cat-relationships)" width="max-w-[460px]" title={`Join ${invite?.party ?? 'the party'}?`}
      description={invite?.from ? `${invite.from} asked you. Choose what the others in it can see.` : 'Choose what the others in it can see.'}>
      <div className="flex flex-col gap-5">
        <SharePicker value={share} onChange={setShare} disabled={pending} />
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Not now</Button>
          <Button variant="primary" disabled={pending} onClick={() => invite && void act(() => answerPartyInvite(invite.partyId, true, share))}>{pending ? 'Joining…' : 'Join'}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Decline: no dialog, the row just leaves. Returns the call so the list can show what happened. */
export const declinePartyInvite = (partyId: string) => answerPartyInvite(partyId, false)

/** “What I share”: change the ticks at any time. */
export function ShareDialog({ party, initial, onClose }: { party: { id: string; name: string } | null; initial: PartyShare; onClose: Done }) {
  const toast = useToast()
  const [share, setShare] = useState(initial)
  const { pending, error, act, clear } = useAct(() => { toast('Saved', 'good'); onClose() })
  useEffect(() => { setShare(initial); clear() }, [party?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!party} onClose={() => { if (!pending) onClose() }} icon={Users} color="var(--cat-relationships)" width="max-w-[460px]" title="What I share" description={party ? `With everyone in ${party.name}. It changes for them straight away.` : undefined}>
      <div className="flex flex-col gap-5">
        <SharePicker value={share} onChange={setShare} disabled={pending} />
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={() => party && void act(() => changePartyShare(party.id, share))}>{pending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Leave: one confirm, because the others stop seeing you at once. */
export function LeaveDialog({ party, onClose }: { party: { id: string; name: string } | null; onClose: Done }) {
  const toast = useToast()
  const { pending, error, act, clear } = useAct(() => { toast('You left the party'); onClose() })
  useEffect(() => { clear() }, [party?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!party} onClose={() => { if (!pending) onClose() }} icon={LogOut} color="var(--bad)" width="max-w-[420px]" title={`Leave ${party?.name ?? 'this party'}?`} description="They stop seeing you now. You can be asked again later.">
      <div className="flex flex-col gap-4">
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Stay</Button>
          <Button variant="danger" disabled={pending} onClick={() => party && void act(() => leavePartyAction(party.id))} data-autofocus>{pending ? 'Leaving…' : 'Leave party'}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Ask one more person from the server. */
export function InviteToPartyDialog({ party, people, onClose }: { party: { id: string; name: string } | null; people: PartyPerson[]; onClose: Done }) {
  const toast = useToast()
  const [picked, setPicked] = useState<string | null>(null)
  const { pending, error, act, clear } = useAct(() => { toast('Asked', 'good'); onClose() })
  useEffect(() => { setPicked(null); clear() }, [party?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!party} onClose={() => { if (!pending) onClose() }} icon={UserPlus} color="var(--cat-relationships)" width="max-w-[420px]" title={`Ask someone into ${party?.name ?? 'the party'}`} description="They get an invitation in Coach › Needs you and choose what they share.">
      <div className="flex flex-col gap-4">
        {people.length ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">People on this server</legend>
            {people.map((p) => <Checkbox key={p.id} checked={picked === p.id} onCheckedChange={(on) => setPicked(on ? p.id : null)} label={p.name} />)}
          </fieldset>
        ) : <p className="text-small text-ink-3">Everyone on this server is already in, or already asked.</p>}
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" disabled={pending || !picked} onClick={() => party && picked && void act(() => inviteToPartyAction(party.id, picked))}>{pending ? 'Asking…' : 'Ask'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
