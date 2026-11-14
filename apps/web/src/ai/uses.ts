import type { Task } from './models'

// Every place the app sends something to an AI model, one entry per `generate(task, label, …)` label, with what goes out.
// Settings → Data & privacy and docs/PRIVACY.md show this list; ai/uses.test.ts fails when a call has no entry, so a new
// `generate()` call must add one. Write `sends` from the call site's prompt, in plain words, and mention what is masked.
// With a local model (LOCAL_LLM_URL) none of it leaves your network.

export type AiUse = {
  /** The label passed to generate(): a string, or a pattern for a family of labels (`parse.orders.<platform>`). */
  label: string | RegExp
  task: Task
  /** Shown to the user: where it runs and what is sent. */
  title: string
  sends: string
}

const DIGEST = 'a digest of your last 28 days (routine and tracker averages, spending totals, top merchants, goals, quests, screen-time totals) and your profile text (goals, constraints, notes)'

export const AI_USES: AiUse[] = [
  { label: 'chat.ask', task: 'chat', title: 'Ask your coach', sends: `Your question and the last few messages, ${DIGEST}, and whatever the coach’s lookup tools return from your data.` },
  { label: 'briefs.area', task: 'parse', title: 'Area one-liners', sends: 'The rule-written line for each area and the facts behind it (names and numbers). Only to reword it.' },
  { label: 'job.classify-sites', task: 'parse', title: 'Sorting new sites and apps', sends: 'The names of websites and Mac apps the app does not know yet. No addresses, page titles or times.' },
  { label: 'job.daily-nudge', task: 'plan', title: 'Morning nudges', sends: `${DIGEST[0].toUpperCase()}${DIGEST.slice(1)}.` },
  { label: 'goals.draft', task: 'plan', title: 'Goal drafts', sends: 'The goal you typed, plus the names and units of your trackers and routines. Sensitive measures (weight, calories, medication, symptoms) are left out.' },
  { label: 'job.weekly-review', task: 'plan', title: 'Weekly review', sends: `${DIGEST[0].toUpperCase()}${DIGEST.slice(1)}, and the numbers behind each goal review that is due.` },
  { label: 'plan.onboarding-routines', task: 'plan', title: 'Starter routines in setup', sends: 'What you wrote about yourself in setup, your goals text, your areas and the routines you already have.' },
  { label: 'rule.watch', task: 'plan', title: 'Live alerts', sends: 'A table of today, yesterday and this week against your usual for spending, crypto prices and positions, health and work, plus the stats you want to improve. Only when something moved.' },
  { label: /^parse\.orders\./, task: 'parse', title: 'Reading an order page', sends: 'The visible text of one shopping app’s order-history page, when the app’s own data was not usable.' },
  { label: /^system\./, task: 'plan', title: 'The System’s daily quests', sends: 'The quest candidates the app computed (names, targets, your recent numbers), your recent quests, patterns across areas and this week’s screen-time totals.' },
]

export const matchesUse = (u: AiUse, label: string) => (typeof u.label === 'string' ? u.label === label : u.label.test(label))
