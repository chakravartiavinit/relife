import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AREAS, TEMPLATE_SLUGS, areaBySlug } from '@/core/areas'
import { AreaLayout } from '@/ui/components/area/area-layout'
import { AddHobbyButton } from '@/ui/components/hobbies'
import { NewPersonButton } from '@/ui/components/forms/people-forms'

// Health, Mind, Skills, Hobbies and People share this template (`/health`, `/health/trends`, ...). Wealth and Time
// have their own folders, which win over this one. Any other top-level path lands here too, so it is a 404 here:
// Cache Components does not allow `dynamicParams = false`, `notFound()` is the supported way to reject a slug.

export const generateStaticParams = () => TEMPLATE_SLUGS.map((area) => ({ area }))

export async function generateMetadata({ params }: LayoutProps<'/[area]'>): Promise<Metadata> {
  const def = areaBySlug((await params).area)
  return def ? { title: def.title } : {}
}

export default async function AreaRootLayout({ children, params }: LayoutProps<'/[area]'>) {
  const { area } = await params
  if (!(TEMPLATE_SLUGS as readonly string[]).includes(area)) notFound()
  const def = AREAS[area as (typeof TEMPLATE_SLUGS)[number]]
  return <AreaLayout def={def} right={area === 'hobbies' ? <AddHobbyButton /> : area === 'people' ? <NewPersonButton /> : undefined}>{children}</AreaLayout>
}
