import type { Category } from '@/db/schema'
import type { PeekRef } from '@/domain/peek'
import type { User } from '../user'

export type AreaSlug = 'health' | 'mind' | 'skills' | 'wealth' | 'hobbies' | 'people' | 'time'

/** `segment` is the URL part after the area (`null` is the Overview). */
export type AreaTab = { segment: string | null; label: string }

/** One headline number of an area. Plain data, so the page, the Life hub and Today's pulse can all draw it. */
export type AreaKpi = {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
  /** Money that counts up on screen instead of a fixed `value`. */
  ticker?: { value: number; currency: string }
  /** Opens this Peek; without one the tile opens the area's summary (`brief:<scope>`). */
  peek?: PeekRef
}

export type AreaDef = {
  slug: AreaSlug
  /** The DB category; null for Time (a lens on laptop activity, not an XP area). */
  category: Category | null
  title: string
  /** Shown under the title while there is no summary line (no data yet, or no brief written). */
  description: string
  color: string
  tabs: AreaTab[]
  /** The four headline numbers. They also feed the Life hub and the brief's facts. */
  kpis: (user: User, today: string) => Promise<AreaKpi[]>
  /** Tracker slugs that come first in All metrics. */
  pinned: string[]
  /** Connector ids that belong to this area (Sources tab). */
  connectors: string[]
}
