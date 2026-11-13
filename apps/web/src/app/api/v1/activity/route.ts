import { getActivity, postActivity } from '@/core/v1/activity'

export const GET = (req: Request) => getActivity(req)
export const POST = (req: Request) => postActivity(req)
