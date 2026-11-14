import type { Connector } from '@/core/types'
import { purgeActivity } from '@/core/activity'

// Laptop activity has no remote source to pull from: the browser extension and the Mac app push to /api/v1/activity and
// the worker's Mac watcher (src/worker/mac-activity.ts) records apps when the Mac app isn't. This connector is the on
// switch (the connection's `enabled` flag), the app-tracking switch and the legacy shared token for extensions before
// 0.7 (it becomes a device row: src/core/auth/devices.ts). Its daily "sync" clears raw stretches older than 90 days.

export const laptop: Connector = {
  id: 'laptop',
  name: 'Laptop activity',
  category: 'mind',
  description: 'Time on sites, YouTube and courses (Chrome extension) and in Mac apps, sorted into learning, work, entertainment and social. Stays on this Mac.',
  provides: ['Learning time', 'Deep work', 'Entertainment', 'Courses'],
  fields: [
    { env: 'ACTIVITY_TOKEN', label: 'Legacy token', optional: true, secret: true, placeholder: 'only for older extensions', hint: 'Extensions before 0.7 sign in with a shared token (openssl rand -hex 24, pasted in their settings). Newer ones connect from Settings → Devices instead. Remove the old token there once the extension is updated.' },
    { env: 'ACTIVITY_APPS', label: 'Mac apps', optional: true, placeholder: 'on', hint: 'Records the app in front (VS Code, Figma, Slack…), never window contents. Type off to track only the browser.' },
  ],
  env: [],
  everyMinutes: 1440,
  reach: 'local',
  async sync(ctx) {
    await purgeActivity(ctx.user)
    ctx.log('Cleared stretches older than 90 days')
  },
}
