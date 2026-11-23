import { isDataItem, type NeedsYouItem } from './needs-you'
import { sentenceCase } from './text'

// The sentence Coach opens with: the first decision and how many follow it. Pure; the queue is already ranked.

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const word = (n: number) => WORDS[n] ?? String(n)

/** What a decision is called in a sentence: the card's own title, or what the party invite says. */
export function itemTitle(i: NeedsYouItem): string {
  switch (i.kind) {
    case 'goal-draft': return sentenceCase(i.draft.title)
    case 'party-invite': return `${i.from ?? 'Someone'} asked you to join ${i.party}`
    case 'unread': return 'A message could not be read'
    case 'categorise': return `Pick a category for ${i.merchant}`
    default: return sentenceCase(i.insight.title)
  }
}

export type CoachOpening = {
  /** Small line above the title: "8 waiting · 4 need a decision". Empty when nothing waits. */
  eyebrow: string
  /** The line under the title. */
  line: string
  /** The insight behind the first decision, so Why? can open it; null for an invite or data. */
  insightId: string | null
}

export function coachOpening(items: NeedsYouItem[]): CoachOpening {
  const decisions = items.filter((i) => !isDataItem(i))
  const data = items.length - decisions.length
  if (!items.length) return { eyebrow: '', line: 'Nothing needs you. New decisions land here as they come.', insightId: null }
  const eyebrow = `${items.length} waiting${decisions.length ? ` · ${decisions.length} need${decisions.length === 1 ? 's' : ''} a decision` : ''}`
  if (!decisions.length) {
    return { eyebrow, line: `Nothing needs a decision. ${sentenceCase(word(data))} to sort can wait.`, insightId: null }
  }
  const first = decisions[0]
  const more = decisions.length - 1
  const after = more ? `; ${word(more)} more ${more === 1 ? 'decision' : 'decisions'} after it` : ''
  const rest = data ? ' The rest can wait.' : ''
  return {
    eyebrow,
    line: `${itemTitle(first)}${after}.${rest}`,
    insightId: 'insight' in first ? first.id : null,
  }
}
