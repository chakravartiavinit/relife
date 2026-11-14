'use client'

import { PARTY_ACTIVE, PARTY_ALONE, PARTY_CLEARED, PARTY_FULL, PARTY_INVITED, PARTY_NEW, PARTY_NONE } from '@/ui/fixtures/party'
import { InviteBody, PeopleOnServer } from '../people-on-server'
import { PartyCard } from './party-card'

// /dev/ui "Party and People": every state of the Party card and of Settings → People on this server, from fixtures.
// Buttons use the real actions, so on fixture ids they fail and the dialog shows its error.

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>{children}</div>
)

const ago = (ms: number) => new Date(Date.parse('2026-11-14T09:00:00Z') - ms).toISOString()
const soon = (ms: number) => new Date(Date.parse('2026-11-14T09:00:00Z') + ms).toISOString()
const DAY = 86_400_000

export function PartyGallery() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 xl:grid-cols-2">
        <Sub title="Party: nobody else on the server (the card is not drawn)">{PARTY_ALONE.people.length ? null : <p className="rounded-lg bg-surface px-5 py-4 text-small text-ink-3 shadow-1">Nothing here: a one-person server has no one to ask.</p>}<PartyCard card={PARTY_ALONE} /></Sub>
        <Sub title="Party: no party yet"><PartyCard card={PARTY_NONE} /></Sub>
        <Sub title="Party: invited"><PartyCard card={PARTY_INVITED} /></Sub>
        <Sub title="Party: just started, one person asked"><PartyCard card={PARTY_NEW} /></Sub>
        <Sub title="Party: active, one member shares nothing"><PartyCard card={PARTY_ACTIVE} /></Sub>
        <Sub title="Party: quest cleared"><PartyCard card={PARTY_CLEARED} /></Sub>
        <Sub title="Party: in 3 parties already"><PartyCard card={PARTY_FULL} /></Sub>
      </div>
      <div className="grid gap-8 xl:grid-cols-2">
        <Sub title="People: only you">
          <PeopleOnServer people={[{ id: 'a', name: 'Alex', role: 'owner', you: true, devices: 2, lastSeenAt: ago(60_000) }]} invites={[]} />
        </Sub>
        <Sub title="People: members, an invite waiting and one expired">
          <PeopleOnServer
            people={[
              { id: 'a', name: 'Alex', role: 'owner', you: true, devices: 2, lastSeenAt: ago(60_000) },
              { id: 'b', name: 'Priya', role: 'member', you: false, devices: 1, lastSeenAt: ago(3 * 3_600_000) },
              { id: 'c', name: 'Sam', role: 'member', you: false, devices: 0, lastSeenAt: null },
            ]}
            invites={[{ id: 'i1', expiresAt: soon(6 * DAY), expired: false }, { id: 'i2', expiresAt: ago(DAY), expired: true }]}
          />
        </Sub>
      </div>
      <div className="grid gap-8 xl:grid-cols-2">
        <Sub title="Invite dialog: a link and its code (the real one opens from Invite someone)">
          <div className="rounded-lg bg-surface p-6 shadow-1"><InviteBody invite={{ id: 'i', expiresAt: soon(7 * DAY), link: 'http://192.168.1.20:3030/join#s=mockmockmockmock', host: '192.168.1.20:3030', loopback: false }} left={7 * DAY} /></div>
        </Sub>
        <Sub title="Invite dialog: no address other people can reach">
          <div className="rounded-lg bg-surface p-6 shadow-1"><InviteBody invite={{ id: null, expiresAt: null, link: null, host: '127.0.0.1:3030', loopback: true }} left={null} /></div>
        </Sub>
      </div>
    </div>
  )
}
