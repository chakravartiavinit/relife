import { getToday } from '@/core/v1/today'

export const GET = (req: Request) => getToday(req)
