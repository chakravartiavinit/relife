import type { Parser } from '@/core/types'

// Days from the public-feed and local-app connectors (src/connectors/feeds.ts).
export const feeds: Parser = {
  id: 'feeds',
  match: () => false,
  parse: () => [],
}
