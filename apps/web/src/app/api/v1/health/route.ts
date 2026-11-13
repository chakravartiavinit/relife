import { postHealth } from '@/core/v1/health'

export const POST = (req: Request) => postHealth(req)
