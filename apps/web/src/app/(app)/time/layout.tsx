import { AREAS } from '@/core/areas'
import { AreaLayout } from '@/ui/components/area/area-layout'
import { TimeSummary } from '@/ui/components/area/time-summary'

/**
 * Time on the area template: the head (no level, it is a lens on laptop activity; today's Today, Focus and Distraction
 * stand where the level is) and the one page, so no tab row.
 */
export default function TimeLayout({ children }: LayoutProps<'/time'>) {
  return <AreaLayout def={AREAS.time} kpis={false} summary={<TimeSummary />}>{children}</AreaLayout>
}
