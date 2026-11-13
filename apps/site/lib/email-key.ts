const GMAIL = new Set(['gmail.com', 'googlemail.com'])

/**
 * One key per mailbox, for comparing "is this the same person" (never for sending): lower-case, drop a +tag, and for
 * Gmail also drop dots and treat googlemail.com as gmail.com. Other providers keep their dots (they are significant).
 */
export function emailKey(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@')
  const base = local.split('+')[0]
  return GMAIL.has(domain) ? `${base.replace(/\./g, '')}@gmail.com` : `${base}@${domain}`
}
