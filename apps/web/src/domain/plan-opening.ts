import type { Pace } from './day-plan'

// The sentence Plan opens with: where the active goals stand against their pace, and which linked action slipped this
// week. Built from `goalPace` labels and `actionStatus` names, so it says nothing the board does not show. Pure.

const list = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** `paces`: one `goalPace` label per active goal (null when it has no snapshot yet). `slipping`: names of linked actions graded Slipping. */
export function planOpening({ paces, slipping }: { paces: (Pace['label'] | null)[]; slipping: string[] }) {
  const n = paces.length
  if (!n) return 'No goals yet. Pick one outcome you want to change.'
  const behind = paces.filter((p) => p === 'Behind').length
  const unknown = paces.filter((p) => !p || p === 'Too early').length
  const ahead = paces.every((p) => p === 'Ahead' || p === 'Reached')
  const every = n === 1 ? 'Your goal is' : n === 2 ? 'Both goals are' : 'All goals are'
  const head = behind
    ? `${behind} of ${n} goals ${behind === 1 ? 'is' : 'are'} behind pace`
    : unknown ? (n === 1 ? 'Your goal is too new to judge pace' : 'Some goals are too new to judge pace')
      : ahead ? `${every} ahead of pace` : `${every} on or ahead of pace`
  if (!slipping.length) return `${head}.`
  const names = list([...new Set(slipping)])
  return behind ? `${head}. ${names} slipped this week.` : `${head}, but ${names} slipped this week.`
}
