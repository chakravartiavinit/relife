import { loadConnectorItems } from '../connector-items'
import type { User } from '../user'
import type { ConnectorPeek } from './types'

/** One connector's card: status, last syncs, and the connect form's fields. `origin` is where OAuth returns to. */
export async function loadConnectorPeek(user: User, id: string, origin: string): Promise<ConnectorPeek | null> {
  const { items, worker } = await loadConnectorItems(user, origin, { probeLocal: id === 'local' })
  const item = items.find((i) => i.id === id)
  return item ? { type: 'connector', item, worker } : null
}
