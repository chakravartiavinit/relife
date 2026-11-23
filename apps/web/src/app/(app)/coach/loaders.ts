import { cache } from 'react'
import { loadNeedsYou } from '@/core/needs-you'
import { loadPatterns } from '@/core/patterns'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'

// The head (layout) and the page both need the queue and the patterns: read each once per request.
export const coachQueue = cache(async () => loadNeedsYou(await getUser()))
export const coachPatterns = cache(async () => {
  const user = await getUser()
  return { patterns: await loadPatterns(user), today: localDate(new Date(), user.timezone) }
})
