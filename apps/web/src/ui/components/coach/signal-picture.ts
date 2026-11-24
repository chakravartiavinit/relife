import type { Signal } from '@/domain/patterns'
import type { PictureRef } from '../../picture'

/** The picture of a pattern signal: its tracker's picture, Today for routines done, delivery for the delivery apps. */
export function signalPicture(s: Signal): PictureRef {
  if (s.id === 'routines') return { of: 'nav', to: '/' }
  if (s.id === 'spend:apps') return { of: 'category', name: 'Food delivery' }
  if (s.id === 'orders:late') return { of: 'routine', name: 'Late night' }
  if (s.id === 'spend') return { of: 'routine', name: 'Spending' }
  return { of: 'tracker', name: s.name, area: s.area }
}

/** Both signals of a connection, for `Connection`'s `pictures`. */
export const pairPictures = (signals: Signal[]): PictureRef[] => signals.slice(0, 2).map(signalPicture)
