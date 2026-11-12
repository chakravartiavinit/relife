import { redirect } from 'next/navigation'

// Trackers moved into Habits. Detail pages stay at /trackers/[slug].
export default function TrackersPage() {
  redirect('/habits?tab=trackers')
}
