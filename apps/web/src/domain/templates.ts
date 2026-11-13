import type { Category } from '@/domain/categories'
import type { SimpleRule } from './recurrence'

// The routine catalogue of setup (/welcome) and the starter packs (src/packs). Pure data: kept out of core/onboarding.ts
// so tests and the client can read it without the database. Templates are suggestions only; everything they create is
// an ordinary routine the user can edit.

export type Template = {
  id: string
  area: Category
  name: string
  kind: 'routine' | 'medicine'
  rule: Omit<SimpleRule, 'start'>
  note?: string
  /** Quantity routine (water): the target comes from the goals step. */
  quantity?: { unit: string; step: number }
  dose?: string
  suggested?: boolean
}

const daily = (...times: string[]): Omit<SimpleRule, 'start'> => ({ freq: 'daily', times })
const weekly = (byweekday: SimpleRule['byweekday'], time: string): Omit<SimpleRule, 'start'> => ({ freq: 'weekly', times: [time], byweekday })

export const TEMPLATES: Template[] = [
  { id: 'water', area: 'health', name: 'Drink water', kind: 'routine', rule: daily('10:00', '13:00', '16:00', '19:00'), quantity: { unit: 'ml', step: 250 }, suggested: true },
  { id: 'morning-skincare', area: 'health', name: 'Morning skincare', kind: 'routine', rule: daily('08:00'), note: 'Cleanser · serum · sunscreen' },
  { id: 'night-skincare', area: 'health', name: 'Night skincare', kind: 'routine', rule: daily('22:30') },
  { id: 'workout', area: 'health', name: 'Workout', kind: 'routine', rule: weekly(['MO', 'WE', 'FR'], '07:00'), suggested: true },
  { id: 'vitamin', area: 'health', name: 'Vitamin D3', kind: 'medicine', rule: daily('09:00'), dose: '1 capsule' },
  { id: 'lights-out', area: 'health', name: 'Lights out', kind: 'routine', rule: daily('23:00') },
  { id: 'journal', area: 'mind', name: 'Journal', kind: 'routine', rule: daily('22:00'), note: 'Three lines', suggested: true },
  { id: 'meditate', area: 'mind', name: 'Meditate', kind: 'routine', rule: daily('07:30'), note: '10 minutes' },
  { id: 'no-phone', area: 'mind', name: 'No phone after 11', kind: 'routine', rule: daily('23:00') },
  { id: 'practice', area: 'skills', name: 'Practice coding', kind: 'routine', rule: daily('19:00'), note: 'One problem', suggested: true },
  { id: 'read', area: 'skills', name: 'Read 20 pages', kind: 'routine', rule: daily('21:30') },
  { id: 'course', area: 'skills', name: 'Course session', kind: 'routine', rule: weekly(['TU', 'TH', 'SA'], '20:00'), note: '30 minutes' },
  { id: 'budget', area: 'wealth', name: 'Review budget', kind: 'routine', rule: weekly(['SU'], '10:00'), suggested: true },
  { id: 'log-spends', area: 'wealth', name: 'Log today’s spends', kind: 'routine', rule: daily('21:00') },
  { id: 'save', area: 'wealth', name: 'Move money to savings', kind: 'routine', rule: { freq: 'monthly', times: ['10:00'], bymonthday: 1 } },
  { id: 'hobby-practice', area: 'hobbies', name: 'Practise your hobby', kind: 'routine', rule: daily('20:00'), note: '20 minutes', suggested: true },
  { id: 'hobby-weekend', area: 'hobbies', name: 'Weekend project', kind: 'routine', rule: weekly(['SA', 'SU'], '11:00'), note: 'An hour on something you make' },
  { id: 'call-parents', area: 'relationships', name: 'Call parents', kind: 'routine', rule: weekly(['WE', 'SU'], '18:00'), suggested: true },
  { id: 'friend', area: 'relationships', name: 'Catch up with a friend', kind: 'routine', rule: weekly(['SA'], '17:00') },
  { id: 'reach-out', area: 'relationships', name: 'Message someone you miss', kind: 'routine', rule: weekly(['TH'], '20:00') },
  // Used by the starter packs (src/packs); not in the plain starter list.
  { id: 'stretch', area: 'health', name: 'Stretch', kind: 'routine', rule: daily('07:15'), note: 'Five minutes' },
  { id: 'evening-walk', area: 'health', name: 'Evening walk', kind: 'routine', rule: daily('18:30'), note: '20 minutes' },
  { id: 'deep-work', area: 'skills', name: 'Deep work block', kind: 'routine', rule: weekly(['MO', 'TU', 'WE', 'TH', 'FR'], '10:00'), note: 'Ninety minutes, phone away' },
  { id: 'wind-down', area: 'mind', name: 'Wind down', kind: 'routine', rule: daily('21:45'), note: 'Screens off, lights low' },
  { id: 'daylight-walk', area: 'health', name: 'Daylight walk', kind: 'routine', rule: daily('08:30'), note: 'Ten minutes outside' },
  { id: 'no-spend-day', area: 'wealth', name: 'No-spend day', kind: 'routine', rule: weekly(['WE'], '21:00'), note: 'Nothing bought today' },
]
