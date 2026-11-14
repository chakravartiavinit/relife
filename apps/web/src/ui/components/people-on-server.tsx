'use client'

import brand from '@relife/brand/brand.json'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, ServerOff, Trash2, UserPlus } from 'lucide-react'
import { createInviteAction, removePersonAction, revokeInviteAction, setShareAiAction, type Invite } from '@/app/people-actions'
import { Switch } from '@/ui/beui/motion/switch'
import { Button } from './button'
import { Badge } from './card'
import { CopyLine } from './devices/copy-line'
import { QrCode } from './devices/qr-code'
import { ago, useCountdown } from './devices/use-countdown'
import { Dialog, FormError } from './forms/dialog'
import { SettingsRow, SettingsSection } from './settings-layout'
import { useToast } from './toast'

export type PersonRow = {
  id: string; name: string; role: 'owner' | 'member'; you: boolean; devices: number; lastSeenAt: string | null
}
export type InviteRow = { id: string; expiresAt: string; expired: boolean }

const ARM_MS = 4000

/** "in 6 days", "in 3 h", "expired". */
function until(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return 'expired'
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86_400) return `in ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86_400)
  return `in ${d} ${d === 1 ? 'day' : 'days'}`
}

/**
 * You › Settings › People on this server (owner only): who is here, an invite link for the next person, removing someone. The
 * list is the page's own server data; every change is a server action that the owner alone can run, and `refresh` re-renders
 * the page. Said plainly on the card: the owner can read everything on their server.
 */
export function PeopleOnServer({ people, invites }: { people: PersonRow[]; invites: InviteRow[] }) {
  const toast = useToast()
  const router = useRouter()
  const onChange = () => router.refresh()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<PersonRow | null>(null)
  const alone = people.length === 1

  const revoke = async (id: string) => {
    const r = await revokeInviteAction(id)
    toast(r.ok ? 'Invite removed' : r.error, r.ok ? 'good' : undefined)
    onChange()
  }

  return (
    <>
      <SettingsSection
        id="people" title="People on this server"
        description={`Everyone here has their own routines, money, keys and devices. You run the server, so you can read all of it; they can read none of yours. Others can use ${brand.name} from a phone or laptop with an invite link.`}
        action={<Button size="sm" variant="secondary" onClick={() => setInviting(true)}><UserPlus className="size-4" strokeWidth={1.5} aria-hidden />Invite someone</Button>}
      >
        {people.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-pill-wash font-display text-heading font-bold text-pill-ink">{p.name.trim().slice(0, 1).toUpperCase() || '?'}</span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                <span className="truncate">{p.name}</span>
                {p.role === 'owner' ? <Badge color="var(--pill)">Owner</Badge> : null}
                {p.you ? <Badge>You</Badge> : null}
              </p>
              <p className="mt-0.5 text-caption text-ink-3">{p.devices} {p.devices === 1 ? 'device' : 'devices'} · {p.lastSeenAt ? `last seen ${ago(p.lastSeenAt)}` : 'not seen yet'}</p>
            </div>
            {p.role === 'member' ? (
              <Button size="sm" variant="ghost" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`}><Trash2 className="size-4" strokeWidth={1.5} aria-hidden />Remove</Button>
            ) : null}
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-ink-2"><Link2 className="size-5" strokeWidth={1.5} /></span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">Invite link<Badge color={i.expired ? 'var(--warn)' : undefined}>{i.expired ? 'Expired' : 'Waiting'}</Badge></p>
              <p className="mt-0.5 text-caption text-ink-3">{i.expired ? 'Nobody used it in time.' : `Works once. Runs out ${until(i.expiresAt)}.`}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void revoke(i.id)}>{i.expired ? 'Clear' : 'Revoke'}</Button>
          </div>
        ))}
        {alone && !invites.length ? (
          <p className="py-5 text-small text-ink-3">Just you so far. Invite someone and they pick a name; no email or password.</p>
        ) : null}
      </SettingsSection>

      <InviteDialog open={inviting} onClose={() => { setInviting(false); onChange() }} />
      <RemoveDialog person={removing} onClose={() => setRemoving(null)} onRemoved={onChange} />
    </>
  )
}

/** The link and QR for the next person. A new one each time it opens; the old one stays in the list until used or revoked. */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const left = useCountdown(invite?.expiresAt ?? null)

  const make = useCallback(async () => {
    setError(null); setInvite(null)
    try {
      const r = await createInviteAction()
      if (r.ok) setInvite(r.invite)
      else setError(r.error)
    } catch { setError('Could not make a link. Try again.') }
  }, [])
  useEffect(() => { if (open) void make() }, [open, make])

  return (
    <Dialog open={open} onClose={onClose} icon={UserPlus} width="max-w-[460px]" title="Invite someone" description="Send them the link or let them scan the code. It works once.">
      {error ? (
        <div className="flex flex-col gap-3">
          <FormError message={error} />
          <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => void make()}><RefreshCw className="size-4" aria-hidden />Try again</Button></div>
        </div>
      ) : !invite ? (
        <div aria-busy className="flex flex-col gap-3">
          <div className="mx-auto aspect-square w-full max-w-[240px] rounded-[20px] bg-surface-2" />
          <div className="h-12 rounded-md bg-surface-2" />
        </div>
      ) : (
        <InviteBody invite={invite} left={left} />
      )}
    </Dialog>
  )
}

/** What the invite dialog shows once the link is made (or known to be impossible): the QR and link, or why there is none. */
export function InviteBody({ invite, left }: { invite: Invite; left: number | null }) {
  return (
    <div className="flex flex-col gap-4">
      {invite.link ? (
        <>
          <QrCode value={invite.link} label="Invite link as a QR code" className="mx-auto w-full max-w-[240px]" dim={left === 0} />
          <CopyLine lines={[invite.link]} label="invite link" />
          <p className="text-caption text-ink-3 tabular-nums">{left === null ? 'Works once, for 7 days.' : left === 0 ? 'Expired. Make a new one.' : `Works once. Runs out in ${until(invite.expiresAt ?? '')}.`}</p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-surface-2 p-5 text-center">
          <ServerOff className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
          <p className="text-body font-semibold text-ink">No address other people can reach</p>
          <p className="text-caption leading-relaxed text-ink-3">You are on {invite.host}, which only opens on this computer. Open {brand.name} on your Tailscale or network address, or set RELIFE_PUBLIC_URL, then invite again.</p>
        </div>
      )}
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-caption leading-relaxed text-ink-3">
        <li>They choose a name and get their own space. They never see yours.</li>
        <li>With a second person here, a browser on this computer no longer signs in without asking: you connect it like any device.</li>
        <li>You can read everything on your own server, including theirs. Tell them.</li>
      </ul>
    </div>
  )
}

/** Remove someone: says what goes, and needs a second press (the first arms the button for 4 seconds), like Delete everything. */
function RemoveDialog({ person, onClose, onRemoved }: { person: PersonRow | null; onClose: () => void; onRemoved: () => void }) {
  const toast = useToast()
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setArmed(false); setError(null) }, [person])
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(t)
  }, [armed])

  async function press() {
    if (!person) return
    if (!armed) return setArmed(true)
    setPending(true)
    const r = await removePersonAction(person.id).catch(() => ({ ok: false as const, error: 'Could not remove them. Nothing was changed.' }))
    setPending(false); setArmed(false)
    if (!r.ok) return setError(r.error)
    toast(`${person.name} removed`, 'good')
    onClose(); onRemoved()
  }

  return (
    <Dialog open={!!person} onClose={() => { if (!pending) onClose() }} icon={Trash2} color="var(--bad)" width="max-w-[460px]" title={`Remove ${person?.name ?? ''}?`}
      description="Their space is deleted for good. Nothing of yours changes.">
      <div className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-ink-2">
          <li>Their routines, entries, payments and goals</li>
          <li>Their saved keys and connections</li>
          <li>Their devices, which sign out at once</li>
          <li>Their place in any party</li>
        </ul>
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="danger" onClick={() => void press()} disabled={pending} data-autofocus>{pending ? 'Removing…' : armed ? 'Tap again to remove' : 'Remove and delete'}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The owner's switch for sharing the AI model with the people on the server. */
export function ShareAiSwitch({ initial }: { initial: boolean }) {
  const toast = useToast()
  const router = useRouter()
  const [on, setOn] = useState(initial)
  return (
    <SettingsRow label="Let others use this model" hint="People on this server use your model and your key. Turn it off and their AI features stop; yours keep working.">
      <div className="flex items-center gap-3">
        <Switch
          checked={on} ariaLabel="Let others on this server use the AI model"
          onCheckedChange={async (next) => {
            setOn(next)
            const r = await setShareAiAction(next).catch(() => ({ ok: false as const, error: 'Could not save that.' }))
            if (!r.ok) { setOn(!next); toast(r.error) } else router.refresh()
          }}
        />
        <span className="text-small text-ink-2">{on ? 'On' : 'Off'}</span>
      </div>
    </SettingsRow>
  )
}
