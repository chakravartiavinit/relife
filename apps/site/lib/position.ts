import { SPOTS_PER_REFERRAL } from './config'

/**
 * Lower score is earlier in line. Each confirmed referral moves a person up SPOTS_PER_REFERRAL places.
 * Ties go to the person with more referrals, then the earlier seq: that keeps "moves you up 10 spots" literally
 * true when the new score lands exactly on someone else's.
 */
export const scoreOf = (p: { seq: number; referralCount: number }) => p.seq - SPOTS_PER_REFERRAL * p.referralCount

/** 1 + confirmed people ahead of `me`. Mirrors the SQL in waitlist.ts. */
export function positionOf(me: { seq: number; referralCount: number }, confirmed: { seq: number; referralCount: number }[]): number {
  const mine = scoreOf(me)
  const ahead = (o: { seq: number; referralCount: number }) =>
    scoreOf(o) !== mine ? scoreOf(o) < mine : o.referralCount !== me.referralCount ? o.referralCount > me.referralCount : o.seq < me.seq
  return 1 + confirmed.filter(ahead).length
}
