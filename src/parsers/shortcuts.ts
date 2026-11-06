import { localDate } from '@/core/time'
import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import { asObj } from './util'

// iPhone Shortcuts health lines: {type:'steps', value, date} or {type:'health', metric, value, unit?, date}.
const METRICS: Record<string, { tracker: string; defaults: TrackerDefaults }> = {
  steps: { tracker: 'steps', defaults: { name: 'Steps', category: 'health', target: 8000 } },
  distance: { tracker: 'walking.km', defaults: { name: 'Walking distance', category: 'health', unit: 'km' } },
  flights: { tracker: 'flights', defaults: { name: 'Flights climbed', category: 'health' } },
  active_energy: { tracker: 'active.kcal', defaults: { name: 'Active energy', category: 'health', unit: 'kcal' } },
  weight: { tracker: 'weight', defaults: { name: 'Weight', category: 'health', unit: 'kg', aggregate: 'last', direction: 'down' } },
  resting_hr: { tracker: 'resting.hr', defaults: { name: 'Resting heart rate', category: 'health', unit: 'bpm', aggregate: 'last', direction: 'down' } },
  mindful_minutes: { tracker: 'mindful.minutes', defaults: { name: 'Mindful minutes', category: 'mind', unit: 'min', kind: 'duration' } },
  screen_time: { tracker: 'screen-time', defaults: { name: 'Screen time', category: 'mind', unit: 'h', aggregate: 'last', direction: 'down' } },
}

export const shortcuts: Parser = {
  id: 'shortcuts',
  match: (e) => e.source === 'shortcuts',
  parse: (e, { user }) => {
    const b = asObj(e)
    const metric = b.type === 'steps' ? 'steps' : String(b.metric ?? '')
    const value = Number(String(b.value).replace(/,/g, ''))
    if (!Number.isFinite(value)) return []
    const known = METRICS[metric]
    const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.date) ? b.date.slice(0, 10) : localDate(e.at, user.timezone)
    const rec: Rec = {
      kind: 'entry',
      tracker: known?.tracker ?? `health.${metric.replace(/[^a-z0-9_.-]/gi, '').toLowerCase()}`,
      date, value: Math.round(value * 100) / 100, source: 'apple-health', verified: true,
      defaults: known?.defaults ?? { category: 'health', unit: typeof b.unit === 'string' ? b.unit : undefined },
    }
    return [rec]
  },
}
