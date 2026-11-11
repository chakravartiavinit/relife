import type { Metadata } from 'next'
import { SourcesView } from '../view'

export const metadata: Metadata = { title: 'Browse sources' }

export default function BrowsePage() {
  return <SourcesView mode="browse" />
}
