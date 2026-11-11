import { Brain, Code, HeartPulse, Palette, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'

/** Each area's 3D picture (public/routines), as in the mockups. Decorative: render with alt="". */
export const AREA_ART: Record<Category, string> = {
  health: '/routines/heart.png',
  mind: '/routines/brain.png',
  skills: '/routines/code.png',
  wealth: '/routines/money.png',
  hobbies: '/routines/music.png',
  relationships: '/routines/people.png',
}

/** Each area's line icon, for places a small glyph fits better than a picture. */
export const AREA_ICON: Record<Category, LucideIcon> = { health: HeartPulse, mind: Brain, skills: Code, wealth: Wallet, hobbies: Palette, relationships: Users }
