import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { ThemeSync } from './theme-toggle'

/** Hands the account's saved theme to the browser (see ThemeSync). Reads the database, so it sits in a Suspense. */
export async function ThemeFromServer() {
  await connection()
  const user = await getUser()
  return <ThemeSync theme={user.profile.prefs?.theme ?? null} />
}
