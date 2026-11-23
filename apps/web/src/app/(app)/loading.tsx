import brand from '@relife/brand/brand.json'
import { Loader } from '@/ui/components/loader'

// Only when a whole page waits (a route change with nothing to show yet): the capsule, after 400ms. Sections inside a
// page keep their own sized skeletons.
export default function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Loader size="page" label={`Loading ${brand.name}`} />
    </div>
  )
}
