import { redirect } from 'next/navigation'

// Overview and Profile became one page: Progress, at /profile.
export default function OverviewPage() {
  redirect('/profile')
}
