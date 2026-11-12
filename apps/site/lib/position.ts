import { SPOTS_PER_REFERRAL } from './config'

/** Lower score is earlier in line. Each confirmed referral moves a person up SPOTS_PER_REFERRAL places. */
export const scoreOf = (p: { seq: number; referralCount: number }) => p.seq - SPOTS_PER_REFERRAL * p.referralCount

/** 1 + confirmed people with a lower score (ties by seq). Mirrors the SQL in waitlist.ts. */
export function positionOf(me: { seq: number; referralCount: number }, confirmed: { seq: number; referralCount: number }[]): number {
  const mine = scoreOf(me)
  return 1 + confirmed.filter((o) => scoreOf(o) < mine || (scoreOf(o) === mine && o.seq < me.seq)).length
}
