import brand from '@relife/brand/brand.json'
import { PageHeader } from '@/ui/components/card'

/** The header stays mounted while Needs you, Patterns and History change underneath it. */
export default function CoachLayout({ children }: LayoutProps<'/coach'>) {
  return (
    <>
      <PageHeader
        eyebrow="Coach" title="Coach"
        description={`Decide on what ${brand.name} suggests, sort what it couldn’t read by itself, and ask about your data.`}
      />
      {children}
    </>
  )
}
