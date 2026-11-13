import { AREAS } from '@/core/areas'
import { AreaLayout } from '@/ui/components/area/area-layout'

/**
 * Wealth on the area template: header and tab row (Overview · Spending · Portfolio · Subscriptions · Sources) stay
 * mounted while a tab changes. Each tab has its own numbers, so the layout draws no strip (`kpis={false}`).
 */
export default function WealthLayout({ children }: LayoutProps<'/wealth'>) {
  return <AreaLayout def={AREAS.wealth} kpis={false}>{children}</AreaLayout>
}
