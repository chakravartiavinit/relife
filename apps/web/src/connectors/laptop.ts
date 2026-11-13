import type { Connector } from '@/core/types'
import { purgeActivity } from '@/core/activity'

// Laptop activity has no remote source to pull from: the browser extension pushes to /api/activity and
// the Mac watcher (src/worker/mac-activity.ts) records apps. This connector holds the shared token and the
// app-tracking switch, and its daily "sync" clears raw stretches older than 90 days.

export const laptop: Connector = {
  id: 'laptop',
  name: 'Laptop activity',
  category: 'mind',
  description: 'Time on sites, YouTube and courses (Chrome extension) and in Mac apps, sorted into learning, work, entertainment and social. Stays on this Mac.',
  provides: ['Learning time', 'Deep work', 'Entertainment', 'Courses'],
  fields: [
    { env: 'ACTIVITY_TOKEN', label: 'Extension token', secret: true, placeholder: 'any long random text', hint: 'Make one with: openssl rand -hex 24. Paste the same in the ReLife extension’s settings. It lets the extension send your time, read today’s quests and routines, and check them off or log entries.' },
    { env: 'ACTIVITY_APPS', label: 'Mac apps', optional: true, placeholder: 'on', hint: 'Records the app in front (VS Code, Figma, Slack…), never window contents. Type off to track only the browser.' },
  ],
  env: ['ACTIVITY_TOKEN'],
  everyMinutes: 1440,
  async sync(ctx) {
    await purgeActivity(ctx.user)
    ctx.log('Cleared stretches older than 90 days')
  },
}
