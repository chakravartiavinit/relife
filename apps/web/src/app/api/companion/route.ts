import { getToday, postAction } from '@/core/v1/today'

// The extension popup's Today tab under its old name; the same handlers as /api/v1/today and /api/v1/today/actions.
// Kept for extensions before 0.7 (and for the old shared token, which is a device now: src/core/auth/devices.ts).

export const GET = (req: Request) => getToday(req, { legacy: true })
export const POST = (req: Request) => postAction(req, { legacy: true })
