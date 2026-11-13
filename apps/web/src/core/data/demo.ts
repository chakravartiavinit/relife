import { env } from '../env'

// The public demo is read-only (RELIFE_DEMO=1). Phase 1's gate already refuses every write; wipe and backup check it
// again themselves, so they stay off even if the gate is ever bypassed. Export is a read of mock data and stays on.
export const isDemo = () => env('RELIFE_DEMO') === '1'
export const DEMO_OFF = 'Demo: changes are off'
