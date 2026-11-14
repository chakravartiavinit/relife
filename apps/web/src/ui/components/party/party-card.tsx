'use client'

import { useState } from 'react'
import { Check, HeartHandshake, LogOut, Plus, Sliders, UserPlus, Users } from 'lucide-react'
import { PARTY_MAX_PER_PERSON, type PartyMemberView, type PartyShare } from '@relife/contract'
import { cheerAction } from '@/app/party-actions'
import type { PartyCard as PartyCardData, PartyEntry, PartyInvite } from '@/core/party'
import { Button } from '../button'
import { Badge, Card, CardHeader } from '../card'
import { Capsule } from '../capsule'
import { CapsuleIcon } from '../capsule-icon'
import { useToast } from '../toast'
import { AcceptPartyDialog, declinePartyInvite, InviteToPartyDialog, LeaveDialog, ShareDialog, StartPartyDialog } from './party-dialogs'

/** What the viewer ticked, read back from their own view: a field is null exactly when it is not shared. */
export const shareOf = (v: PartyMemberView): PartyShare => ({
  name: v.name !== null, level: v.level !== null, streak: v.streak !== null, today: v.today !== null, quests: v.quests !== null, achievements: v.achievements !== null,
})

/**
 * You › Progress › Party, below the character banner (Today stays free of social pressure). Nothing here ranks anyone: people
 * are listed in the order they joined, and a member shows only what they ticked. The quest is shared: “Everyone shows up on 5
 * of 7 days”, with a bar for how many are on track.
 */
export function PartyCard({ card }: { card: PartyCardData }) {
  const [starting, setStarting] = useState(false)
  const [accepting, setAccepting] = useState<PartyInvite | null>(null)
  const empty = !card.parties.length && !card.invites.length
  // A server with one person has no one to ask: the card stays out of the way until there is.
  if (empty && !card.people.length) return null
  return (
    <Card aria-labelledby="party-h" as="section" className="flex flex-col gap-5">
      <CardHeader
        icon={<Users strokeWidth={1.5} />} color="var(--cat-relationships)"
        title={<span id="party-h">Party</span>}
        description="Show up with a few people on this server. Each of you shares only what you tick."
        action={!card.full ? <Button size="sm" variant="secondary" onClick={() => setStarting(true)}><Plus className="size-4" strokeWidth={1.5} aria-hidden />Start a party</Button> : null}
        className="mb-0"
      />
      {empty ? (
        <p className="rounded-md bg-surface-2 px-4 py-3.5 text-small leading-relaxed text-ink-2">
          No party yet. A party is a small group with one shared weekly quest. Nobody is ranked, and nothing shows until you choose it.
        </p>
      ) : null}
      {card.invites.map((i) => <InviteLine key={i.partyId} invite={i} onAccept={() => setAccepting(i)} />)}
      {card.parties.map((p) => <PartySection key={p.view.id} entry={p} />)}
      {card.full ? <p className="text-caption text-ink-3">You are in {PARTY_MAX_PER_PERSON} parties, the most one person can be in.</p> : null}
      <StartPartyDialog open={starting} onClose={() => setStarting(false)} people={card.people} />
      <AcceptPartyDialog invite={accepting} onClose={() => setAccepting(null)} />
    </Card>
  )
}

function InviteLine({ invite, onAccept }: { invite: PartyInvite; onAccept: () => void }) {
  const toast = useToast()
  const [gone, setGone] = useState(false)
  const [declining, setDeclining] = useState(false)
  if (gone) return null
  async function decline() {
    setDeclining(true)
    const r = await declinePartyInvite(invite.partyId).catch(() => ({ ok: false as const, error: 'Couldn’t decline that. Try again.' }))
    setDeclining(false)
    if (r.ok) setGone(true); else toast.error(r.error)
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-pill-wash px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-body font-medium text-ink">{invite.from ?? 'Someone'} asked you to join {invite.party}</p>
        <p className="text-caption text-ink-3">{invite.members} {invite.members === 1 ? 'person is' : 'people are'} in. You choose what you share.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={decline} disabled={declining}>{declining ? 'Declining…' : 'Decline'}</Button>
        <Button size="sm" variant="primary" onClick={onAccept} disabled={declining}>Join</Button>
      </div>
    </div>
  )
}

function PartySection({ entry }: { entry: PartyEntry }) {
  const { view, invitable } = entry
  const me = view.members.find((m) => m.you)
  const [sharing, setSharing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const { quest } = view
  return (
    <section aria-label={view.name} className="flex flex-col gap-4 border-t border-divider pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-heading font-semibold text-ink">{view.name}</h3>
        <div className="flex flex-wrap items-center gap-1">
          {invitable.length ? <Button size="sm" variant="ghost" onClick={() => setInviting(true)}><UserPlus className="size-4" strokeWidth={1.5} aria-hidden />Ask someone</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setSharing(true)}><Sliders className="size-4" strokeWidth={1.5} aria-hidden />What I share</Button>
          <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}><LogOut className="size-4" strokeWidth={1.5} aria-hidden />Leave</Button>
        </div>
      </div>
      <div className="rounded-md bg-surface-2 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-body font-medium text-ink">{quest.title}</p>
          {quest.cleared ? <Badge color="var(--good)">Cleared</Badge> : <span className="text-small text-ink-3 tabular-nums">{quest.onTrack} of {quest.members} on track</span>}
        </div>
        <Capsule className="mt-2.5" size="sm" value={quest.cleared ? quest.members : quest.onTrack} max={Math.max(1, quest.members)} color="var(--cat-relationships)" label={`${quest.onTrack} of ${quest.members} on track for ${quest.title}`} />
        {quest.members < 2 && !quest.cleared ? <p className="mt-2 text-caption text-ink-3">It needs at least two people from the start of the week. Ask someone in.</p> : null}
      </div>
      <ul className="flex flex-col divide-y divide-divider">
        {view.members.map((m) => <MemberRow key={m.id} m={m} target={quest.target} />)}
      </ul>
      <ShareDialog party={sharing ? { id: view.id, name: view.name } : null} initial={me ? shareOf(me) : { name: true, level: true, streak: false, today: false, quests: false, achievements: false }} onClose={() => setSharing(false)} />
      <LeaveDialog party={leaving ? { id: view.id, name: view.name } : null} onClose={() => setLeaving(false)} />
      <InviteToPartyDialog party={inviting ? { id: view.id, name: view.name } : null} people={invitable} onClose={() => setInviting(false)} />
    </section>
  )
}

function MemberRow({ m, target }: { m: PartyMemberView; target: number }) {
  const toast = useToast()
  const [cheered, setCheered] = useState(false)
  const [pending, setPending] = useState(false)
  const name = m.name ?? 'A member'
  const shown = [
    m.level ? `Level ${m.level.level} · ${m.level.title}` : null,
    m.streak !== null ? `${m.streak}-day streak` : null,
    m.today ? `${m.today.done} of ${m.today.total} today` : null,
    m.achievements?.length ? `Unlocked ${m.achievements.slice(0, 2).join(', ')}${m.achievements.length > 2 ? ` and ${m.achievements.length - 2} more` : ''}` : null,
  ].filter(Boolean)
  const nothing = m.status === 'active' && !shown.length && !m.quests
  async function cheer() {
    setPending(true)
    const r = await cheerAction(m.id).catch(() => ({ ok: false as const, error: 'Couldn’t send that. Try again.' }))
    setPending(false)
    if (!r.ok) return toast.error(r.error)
    setCheered(true)
    // Nothing is saved when they have no Telegram or phone connected; say so rather than claim it went.
    if (r.queued) toast('Cheer sent', 'good'); else toast('They have no notifications set up, so this one can’t reach them.')
  }
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <CapsuleIcon size="sm" color="var(--cat-relationships)" letter={name.trim().slice(0, 1).toUpperCase() || '?'} className="mr-1" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
          <span className="truncate">{name}</span>
          {m.you ? <Badge>You</Badge> : null}
          {m.status === 'invited' ? <Badge color="var(--warn)">Asked, not joined</Badge> : null}
        </p>
        <p className="mt-0.5 text-caption text-ink-3">{m.status === 'invited' ? 'They choose what to share when they join.' : nothing ? 'Keeps the rest private.' : shown.join(' · ')}</p>
        {m.quests?.length ? (
          <div className="mt-1.5 flex max-w-56 flex-col gap-1">
            {m.quests.map((p, i) => <Capsule key={i} size="sm" value={p} max={100} label={`Weekly quest ${i + 1}: ${p} percent`} />)}
          </div>
        ) : null}
      </div>
      {m.status === 'active' ? (
        <span className="flex items-center gap-2 text-small text-ink-2 tabular-nums">
          <span aria-hidden className={`size-[7px] rounded-full ${m.week.onTrack ? 'bg-good' : 'bg-ink-3'}`} />
          {m.week.onTrack ? 'On track' : 'Not yet'}{m.week.days !== null ? ` · ${Math.min(m.week.days, target)}/${target}` : ''}
        </span>
      ) : null}
      {!m.you && m.status === 'active' ? (
        <Button size="sm" variant="ghost" onClick={cheer} disabled={pending || cheered} aria-label={`Cheer ${name}`}>
          {cheered ? <Check className="size-4 text-good" strokeWidth={2} aria-hidden /> : <HeartHandshake className="size-4" strokeWidth={1.5} aria-hidden />}
          {cheered ? 'Cheered' : 'Cheer'}
        </Button>
      ) : null}
    </li>
  )
}
