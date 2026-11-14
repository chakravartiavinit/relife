import type { ShareData, ShareKind } from '@/domain/share-card'

// Made-up people and numbers for /dev/ui and the route test. `GET /api/share/card?fixture=<kind>` draws these (only when
// RELIFE_MOCK=1 or outside production); it never reads a user's data.

export const SHARE_FIXTURES: Record<ShareKind, ShareData> = {
  level: {
    kind: 'level', name: 'Alex', level: 22, title: 'Vanguard', totalXp: 20_418,
    areas: [{ label: 'Health', level: 9 }, { label: 'Mind', level: 6 }, { label: 'Skills', level: 8 }, { label: 'Wealth', level: 3 }, { label: 'Hobbies', level: 5 }, { label: 'People', level: 4 }],
  },
  streak: { kind: 'streak', name: 'Alex', days: 30, best: 57, freezesUsed: 2 },
  achievement: { kind: 'achievement', name: 'Alex', title: 'Early bird 🌅', tier: 'gold', date: '2026-11-02' },
  weekly: {
    kind: 'weekly', name: 'Alex', weekStart: '2026-11-09', daysShown: 6, xp: 1284, questsCleared: 3, topArea: 'Health',
    routines: { done: 41, total: 49 }, goals: { onPace: 2, total: 3 }, stepsAvg: 9772, sleepAvgHours: 7.4, spend: 'less',
  },
}
