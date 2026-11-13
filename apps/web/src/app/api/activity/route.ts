import { getActivity, postActivity } from '@/core/v1/activity'

// The extension's time posts under their old name; the same handlers as /api/v1/activity.
// Kept for extensions before 0.7 (and for the old shared token, which is a device now: src/core/auth/devices.ts).

export const GET = (req: Request) => getActivity(req, { legacy: true })
export const POST = (req: Request) => postActivity(req, { legacy: true })
