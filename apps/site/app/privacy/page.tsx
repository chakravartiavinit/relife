import type { Metadata } from 'next'
import { SimpleNav } from '@/components/simple-nav'
import { contactEmail } from '@/lib/config'
import { NAME } from '@/lib/site'

export const metadata: Metadata = { title: 'Privacy', description: `What the ${NAME} waitlist stores, why, for how long, and how to leave.`, alternates: { canonical: '/privacy' } }

export default function Privacy() {
  return (
    <>
      <SimpleNav />
      <main id="main" className="wrap">
        <article className="prose">
          <span className="sys">Privacy</span>
          <h1 className="display" style={{ marginTop: 14 }}>What the waitlist stores.</h1>
          <p>This page covers the {NAME} waitlist on this site. It is separate from the {NAME} app, which keeps your life data on your own machine.</p>

          <h2>What we store</h2>
          <ul>
            <li>Your email address.</li>
            <li>The choices you make in the form: the areas you want to level up and where you will use {NAME}.</li>
            <li>When you joined and confirmed, and where you came from (a campaign tag or the site that linked here), so we know which posts work.</li>
            <li>A referral code for your link, and who referred you if you came through a link.</li>
            <li>A one-way hash of your IP address, used only to limit spam. We do not keep the address itself.</li>
          </ul>

          <h2>Why</h2>
          <p>To email you about {NAME}&apos;s launch and to invite people in order. Nothing else, and we do not sell or share the list. Page views are counted with Vercel Web Analytics, which sets no cookies and builds no profile of you.</p>

          <h2>How long</h2>
          <p>Signups you never confirm are deleted after 7 days. Confirmed signups stay until you leave or until early access has been sent to everyone, whichever comes first. Spam-limit records are deleted after 24 hours.</p>

          <h2>How to leave</h2>
          <p>Open the link in any email we sent you and choose &ldquo;Leave the waitlist&rdquo;. It deletes your email and your place at once. {contactEmail ? <>You can also write to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and ask us to delete or export what we hold.</> : 'You can also reply to any email from us and ask us to delete or export what we hold.'}</p>

          <h2>Your rights</h2>
          <p>Under the GDPR and India&apos;s Digital Personal Data Protection Act you can ask to see, correct or delete your data and withdraw consent at any time. Leaving the waitlist does all of that.</p>
        </article>
      </main>
    </>
  )
}
