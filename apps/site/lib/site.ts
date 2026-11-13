import brand from '@relife/brand/brand.json'
import { siteUrl } from './config'

export const NAME = brand.name
export const TITLE = `${brand.name}: level up your real life`
export const DESCRIPTION = `${brand.name} pulls in your sleep, workouts, code, learning and spending, then turns them into daily quests, XP and streaks. Your data stays on your machine.`
export const publicReady: boolean = brand.publicReady
export { siteUrl }
