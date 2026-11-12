import { emailKey } from './email-key'

/**
 * No credit for a signup that is probably the referrer themselves: the same mailbox under another alias
 * (a+1@, a.b@gmail.com) or the same network (IP hash), however long ago the referrer joined.
 * Shared networks (a household, an office) lose referrals too; that is the price of a check that can't be waited out.
 */
export function isSelfReferral(p: { referrerEmail: string; referrerIpHash: string | null; email: string; ipHash: string }): boolean {
  return emailKey(p.referrerEmail) === emailKey(p.email) || (p.referrerIpHash !== null && p.referrerIpHash === p.ipHash)
}
