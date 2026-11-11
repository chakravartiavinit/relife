import type { Parser } from '@/core/types'

// Days from the bring-your-own-key connectors (src/connectors/byok.ts).
export const byok: Parser = {
  id: 'byok',
  match: () => false,
  parse: () => [],
}
