import { redirect } from 'next/navigation'

// Routines moved into Habits.
export default async function SchedulesPage({ searchParams }: PageProps<'/schedules'>) {
  const sp = await searchParams
  redirect(sp.new === '1' ? '/habits?new=1' : '/habits')
}
