import { redirect } from 'next/navigation'

// Routines moved into Habits. Only redirects, reading ?new=1, so it runs at request time.
export const instant = false

export default async function SchedulesPage({ searchParams }: PageProps<'/schedules'>) {
  const sp = await searchParams
  redirect(sp.new === '1' ? '/habits?new=1' : '/habits')
}
