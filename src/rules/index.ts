import type { Rule } from '@/core/types'
import { connectorFailing } from './connector-failing'
import { goalBehind } from './goal-behind'
import { lowBalance } from './low-balance'
import { medicineStock } from './medicine-stock'
import { noCommits } from './no-commits'
import { streakAtRisk } from './streak-at-risk'
import { workoutGap } from './workout-gap'
import { watch } from './watch'

export const rules: Rule[] = [medicineStock, connectorFailing, goalBehind, noCommits, streakAtRisk, workoutGap, lowBalance, watch]
