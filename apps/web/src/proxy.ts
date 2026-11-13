import type { NextRequest } from 'next/server'
import { gate } from '@/core/auth/gate'

// Next runs this before every request; the rules are in src/core/auth/gate.ts.
export const proxy = (req: NextRequest) => gate(req)
