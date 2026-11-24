import brand from '@relife/brand/brand.json'
import { Loader } from '@/ui/components/loader'

// Only when a whole page waits (a route change with nothing to show yet): the capsule, after 400ms. Sections inside a
// page keep their own sized skeletons. Next swaps this out the moment the page is ready, so the 500ms minimum that
// LoaderSwap keeps does not apply here; the loader fades in, so a page ready at 450-900ms shows a brief soft fade.
export default function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Loader size="page" label={`Loading ${brand.name}`} />
    </div>
  )
}
