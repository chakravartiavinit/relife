import type { Metadata } from 'next'
import { ConfirmOnLoad, LeaveButton, ReferralBox } from '@/components/status-client'
import { SimpleNav } from '@/components/simple-nav'
import { SPOTS_PER_REFERRAL } from '@/lib/config'
import { NAME, siteUrl } from '@/lib/site'
import { statusFor } from '@/lib/waitlist'

export const metadata: Metadata = { title: 'Your spot', robots: { index: false, follow: false } }

const n = (v: number) => v.toLocaleString('en-US')

export default async function StatusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ left?: string }> }) {
  const { token } = await params
  const { left } = await searchParams
  const s = token.length <= 100 ? await statusFor(token) : null

  return (
    <>
      <SimpleNav />
      <main id="main" className="status wrap">
        <div className="card e2 status-card">
          {!s ? (
            <>
              <span className="sys">{left ? 'You left' : 'Link not valid'}</span>
              <h1 className="display" style={{ marginTop: 10, fontSize: 'clamp(30px, 6vw, 40px)' }}>{left ? "You've left the waitlist." : "This link isn't valid."}</h1>
              <p className="sub">{left ? 'Your email and your place were deleted.' : 'It may have been replaced by a newer email, or the spot was deleted.'}</p>
              <a href="/#waitlist" className="btn ink" style={{ marginTop: 24 }}>{left ? 'Rejoin the waitlist' : 'Join the waitlist'}</a>
            </>
          ) : s.status === 'pending' ? (
            <>
              <span className="sys">One last step</span>
              <h1 className="display" style={{ marginTop: 10, fontSize: 'clamp(30px, 6vw, 40px)' }}>Confirm your spot.</h1>
              <ConfirmOnLoad token={token} />
              <noscript>
                <form method="post" action="/api/waitlist/confirm">
                  <input type="hidden" name="token" value={token} />
                  <button type="submit" className="btn ink" style={{ marginTop: 16 }}>Confirm my spot</button>
                </form>
              </noscript>
            </>
          ) : (
            <>
              <span className="sys">{NAME} waitlist</span>
              <p className="big num">You&apos;re #{n(s.position!)}</p>
              <p className="sub num">Confirmed people ahead of you: {n(s.ahead!)}</p>
              <ReferralBox url={`${siteUrl}/?ref=${s.refCode}`} name={NAME} />
              <p className="stats">
                <span>Each friend who confirms moves you up to <b>{SPOTS_PER_REFERRAL}</b> places</span>
                <span>Friends joined: <b>{n(s.referralCount)}</b></span>
              </p>
              <div className="leave">
                <LeaveButton token={token} />
                <noscript>
                  <form method="post" action="/api/waitlist/leave"><input type="hidden" name="token" value={token} /><button type="submit">Leave the waitlist (deletes my email)</button></form>
                </noscript>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
