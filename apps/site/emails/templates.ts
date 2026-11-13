import brand from '@relife/brand/brand.json'
import { siteUrl, SPOTS_PER_REFERRAL } from '@/lib/config'
import type { Email } from '@/lib/email'

// Plain HTML strings: three short transactional mails don't need a template framework.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function layout(title: string, body: string, button?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f7f9fb;font-family:Inter,system-ui,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:32px">
<tr><td><p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#3d6fa8">${esc(brand.name)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${esc(title)}</h1>
${body}
${button ? `<p style="margin:24px 0"><a href="${button.href}" style="display:inline-block;background:#1b1b1b;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${esc(button.label)}</a></p>` : ''}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">You're getting this because this address joined the ${esc(brand.name)} waitlist. It's the only thing we'll email you about.</p>
</td></tr></table></td></tr></table></body></html>`
}

const p = (s: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${s}</p>`
export const statusUrl = (token: string) => `${siteUrl}/w/${token}`
export const referralUrl = (refCode: string) => `${siteUrl}/?ref=${refCode}`
const unsubscribe = (token: string) => ({ 'List-Unsubscribe': `<${statusUrl(token)}>` })

export function confirmEmail(to: string, token: string): Email {
  const link = statusUrl(token)
  return {
    to, subject: `Confirm your spot on the ${brand.name} waitlist`, headers: unsubscribe(token),
    text: `Confirm your spot on the ${brand.name} waitlist:\n${link}\n\nIf this wasn't you, ignore this email and nothing happens. The request expires in 7 days.`,
    html: layout('Confirm your spot', p('One tap and you are on the list. If this wasn\'t you, ignore this email and nothing happens.'), { label: 'Confirm my spot', href: link }),
  }
}

/** No status link: the member's link is the one in their welcome mail, and a re-submit must not replace it. */
export function alreadyConfirmedEmail(to: string, refCode: string): Email {
  const ref = referralUrl(refCode)
  return {
    to, subject: `You're already on the ${brand.name} waitlist`,
    text: `You're already on the ${brand.name} waitlist. Your link to see your spot and leave any time is in the welcome email we sent when you confirmed (search your inbox for "${brand.name}").\n\nYour referral link: ${ref}`,
    html: layout("You're already on the list", p('Your link to see your spot and leave any time is in the welcome email we sent when you confirmed. Search your inbox for it.')
      + p(`Referral link: <a href="${ref}">${esc(ref)}</a>`)),
  }
}

export function welcomeEmail(to: string, token: string, refCode: string): Email {
  const link = statusUrl(token)
  const ref = referralUrl(refCode)
  return {
    to, subject: `You're on the ${brand.name} waitlist`, headers: unsubscribe(token),
    text: `You're confirmed.\n\nYour spot: ${link}\nYour referral link: ${ref}\nEach friend who confirms moves you up to ${SPOTS_PER_REFERRAL} places.\n\nWhat happens next: we invite people in order, in small batches, with an email like this one. Nothing else.`,
    html: layout("You're on the list", p(`Your spot and your referral link are below. Each friend who confirms moves you up to ${SPOTS_PER_REFERRAL} places.`)
      + p(`Referral link: <a href="${ref}">${esc(ref)}</a>`)
      + p('What happens next: we invite people in order, in small batches, with an email like this one. Nothing else.'), { label: 'See my spot', href: link }),
  }
}
