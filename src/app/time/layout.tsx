import { AREAS } from '@/core/areas'
import { AreaLayout } from '@/ui/components/area/area-layout'

/** Time on the area template: the header (no level, it is a lens on laptop activity) and today's numbers. One page, so no tab row. */
export default function TimeLayout({ children }: LayoutProps<'/time'>) {
  return <AreaLayout def={AREAS.time}>{children}</AreaLayout>
}
