import type { Connector } from '@/core/types'
import { anki } from './anki'
import { letterboxd } from './letterboxd'
import { openlibrary } from './openlibrary'

// Connectors that read public feeds or a local app, with no key.
export const feedConnectors: Connector[] = [letterboxd, openlibrary, anki]
