import { cache } from 'react'
import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'

/** The user and their XP, loaded once per request for everything in the shell that needs them (rail rows, player block). */
export const railXp = cache(async () => {
  await connection()
  const user = await getUser()
  return { user, xp: await xpSummary(user) }
})
