// A static list of throwaway-mail domains. Not exhaustive: it stops the obvious ones, Turnstile is the escalation switch.
const DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com',
  'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'spamgourmet.com', 'getairmail.com',
  'mailcatch.com', 'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'burnermail.io', 'discard.email', 'discardmail.com', 'spambox.us', 'spam4.me',
  'harakirimail.com', 'inboxbear.com', 'moakt.com', 'tempinbox.com', 'dropmail.me', 'emailfake.com', 'fakemail.net', 'mailtemp.net',
  'throwam.com', 'tempail.com', 'luxusmail.org', 'mail.tm', 'internxt.com', 'cuvox.de', 'armyspy.com', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us',
])

export function isDisposable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  const parts = domain.split('.')
  // Match the domain and any parent (a.b.mailinator.com).
  return parts.some((_, i) => DOMAINS.has(parts.slice(i).join('.')))
}
