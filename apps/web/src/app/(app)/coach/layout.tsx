import brand from '@relife/brand/brand.json'
import { PageHeader } from '@/ui/components/card'
import { CoachTabs } from '@/ui/components/coach/coach-tabs'

/** The head and its tabs stay mounted while Needs you, Patterns and History change underneath it. */
export default function CoachLayout({ children }: LayoutProps<'/coach'>) {
  return (
    <>
      <PageHeader
        title="Coach"
        description={`Decide on what ${brand.name} suggests, sort what it couldn’t read by itself, and ask about your data.`}
        tabs={<CoachTabs />}
      />
      {children}
    </>
  )
}
