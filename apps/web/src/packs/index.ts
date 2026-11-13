import { Pack } from '@relife/contract'
import fitness from './fitness.json'
import money from './money.json'
import recovery from './recovery.json'
import studentDev from './student-dev.json'

// The starter packs of setup. Validated at import, so a broken file fails every test that loads them.
export const BUILT_IN_PACKS: Pack[] = [fitness, money, studentDev, recovery].map((p) => Pack.parse(p))

/** A built-in pack's name from its id, for "From the Fitness pack". */
export const packName = (id: string) => BUILT_IN_PACKS.find((p) => p.id === id)?.name ?? 'starter'
