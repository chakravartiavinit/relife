import type { ShareKind } from '@/domain/share-card'

// Anything that earns a moment can offer a card: `openShareCard('level', '22')`. The one `ShareCardDialog` in the app
// layout listens for the event, like `celebrateLevel` and Capture's `relife:command`. `ref` is the level number, the
// achievement key or the week's Monday; the server checks it is earned.
export type ShareRequest = { kind: ShareKind; ref?: string }
export const SHARE_EVENT = 'relife:share'
export const openShareCard = (kind: ShareKind, ref?: string) => window.dispatchEvent(new CustomEvent<ShareRequest>(SHARE_EVENT, { detail: { kind, ref } }))
