import { IlloAreas, IlloConnect, IlloLog, IlloProgress, IlloRemind, IlloToday, IlloWelcome } from './illos'

/** The product tour: step 0 is the centred welcome, the rest point at a `data-tour` anchor. */
export const TOUR_STEPS: { anchor: string | null; title: string; body: string; Illo: () => React.JSX.Element }[] = [
  {
    anchor: null,
    title: 'Welcome to ReLife',
    body: 'ReLife turns your days into a character you level up. A one-minute tour shows the six things you\'ll use most.',
    Illo: IlloWelcome,
  },
  {
    anchor: '/',
    title: 'Clear today\'s quests',
    body: 'Today lists what\'s due now. The System adds daily quests from your own numbers, and synced steps or sleep clear them on their own.',
    Illo: IlloToday,
  },
  {
    anchor: 'command',
    title: 'Log anything in two words',
    body: 'Press ⌘K and type what you did, like "coffee 2". Something new gets its own tracker the first time you log it.',
    Illo: IlloLog,
  },
  {
    anchor: '/profile',
    title: 'Watch your character grow',
    body: 'Every check-off earns XP. Keep your streak going for up to ×1.5 XP, open chests and unlock achievements.',
    Illo: IlloProgress,
  },
  {
    anchor: 'areas',
    title: 'Six areas of your life',
    body: 'Health, Mind, Skills, Wealth, Hobbies and People each get a page with their own numbers and trends.',
    Illo: IlloAreas,
  },
  {
    anchor: '/connectors',
    title: 'Your day, logged for you',
    body: 'Connect GitHub, your order apps or your phone, and what you do there lands here by itself, at full XP. You pick what syncs.',
    Illo: IlloConnect,
  },
  {
    anchor: '/settings',
    title: 'Reminders that wait for a tap',
    body: 'ReLife can nudge you on Telegram. Tap Done there and it counts here. Quiet hours and limits live in Settings.',
    Illo: IlloRemind,
  },
]
