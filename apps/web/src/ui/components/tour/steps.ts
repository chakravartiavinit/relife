import type { BeatSet } from './illo-kit'
import {
  AREAS_BEATS, CONNECT_BEATS, IlloAreas, IlloConnect, IlloLog, IlloProgress, IlloRemind, IlloToday, IlloWelcome, LOG_BEATS,
  PROGRESS_BEATS, REMIND_BEATS, TODAY_BEATS, WELCOME_BEATS,
} from './illos'

/**
 * The product tour: step 0 is the centred welcome, the rest point at a `data-tour` anchor. An `optional`
 * stop is left out when its anchor isn't on the page (the Today checklist goes once setup is finished).
 * A stop without `Illo` shows no picture. `beats` names what the picture shows, in order, on its own clock;
 * the body then says why it matters, so the two never repeat each other.
 */
export type TourStep = { anchor: string | null; title: string; body: string; Illo?: () => React.JSX.Element; beats?: BeatSet; optional?: boolean }

export const TOUR_STEPS: TourStep[] = [
  {
    anchor: null,
    title: 'Welcome to ReLife',
    body: 'Everything you do, typed in or synced, earns XP for one character: you. A one-minute tour shows where it all happens.',
    Illo: IlloWelcome,
    beats: WELCOME_BEATS,
  },
  {
    anchor: '/',
    title: 'Clear today’s quests',
    body: 'Today lists what’s due now. The System adds daily quests from your own numbers, and synced steps or sleep clear them without a tap.',
    Illo: IlloToday,
    beats: TODAY_BEATS,
  },
  {
    anchor: 'command',
    title: 'Log anything in two words',
    body: 'Press ⌘K and type what you did. Something new gets its own tracker the first time you log it.',
    Illo: IlloLog,
    beats: LOG_BEATS,
  },
  {
    anchor: '/you',
    title: 'Watch your character grow',
    body: 'Check-offs earn XP, a streak adds up to 50% more, and chests pay a bonus. Fill the bar to level up.',
    Illo: IlloProgress,
    beats: PROGRESS_BEATS,
  },
  {
    anchor: 'areas',
    title: 'Six areas of your life',
    body: 'Health, Mind, Skills, Wealth, Hobbies and People each get a page with their own numbers and trends. Life shows them all at once.',
    Illo: IlloAreas,
    beats: AREAS_BEATS,
  },
  {
    anchor: '/you',
    title: 'Your day, logged for you',
    body: 'In You › Connections, connect GitHub, your order apps or your phone, and what you do there lands here by itself, at full XP. You pick what syncs.',
    Illo: IlloConnect,
    beats: CONNECT_BEATS,
  },
  {
    anchor: '/you',
    title: 'Reminders that wait for a tap',
    body: 'ReLife can nudge you on Telegram, and Done there counts here. Set quiet hours and limits in You › Notifications.',
    Illo: IlloRemind,
    beats: REMIND_BEATS,
  },
  {
    anchor: 'setup',
    title: 'Finish setting up',
    body: 'A few things are left, like your phone and your apps. Each one makes ReLife log more for you. Hide this card when you’re done with it.',
    optional: true,
  },
]
