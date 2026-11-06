import type { Db } from '@/db'
import type { Category } from '@/db/schema'
import type { User } from './user'

/** Normalized record produced by parsers. `ingest.persist()` knows how to store each kind. */
export type Rec =
  | {
      kind: 'entry'
      tracker: string // slug; auto-created on first use
      date: string // local YYYY-MM-DD
      value: number
      source: string
      mode?: 'set' | 'add' // 'add' accumulates into the same day (manual logs); default 'set'
      verified?: boolean
      note?: string
      meta?: Record<string, unknown>
      defaults?: TrackerDefaults // used only when the tracker does not exist yet
    }
  | {
      kind: 'transaction'
      account: AccountRef
      at: Date
      amount: number // signed, negative = money out
      currency: string
      merchant?: string
      upiId?: string
      balance?: number // available balance reported with the transaction
      source: string // institution, not channel: SMS and email of one payment share it
      externalRef: string
      meta?: Record<string, unknown>
    }
  | {
      kind: 'trade'
      account: AccountRef
      at: Date
      symbol: string // BASE/QUOTE
      side: 'buy' | 'sell'
      qty: number
      price: number
      fee: number
      feeAsset?: string
      tradeKind?: 'spot' | 'p2p' | 'convert' | 'futures'
      source: string
      externalRef: string
      meta?: Record<string, unknown>
    }
  | { kind: 'holding'; account: AccountRef; asset: string; qty: number; priceUsd?: number; at: Date }
  | { kind: 'balance'; account: AccountRef; amount: number; at: Date }

export type AccountRef = {
  key: string // stable id, e.g. 'axis:1234', 'binance'
  kind: 'bank' | 'card' | 'exchange' | 'wallet' | 'broker' | 'manual_asset' | 'loan'
  name: string
  institution?: string
  currency?: string
}

export type TrackerDefaults = {
  name?: string
  category?: Category
  kind?: 'bool' | 'number' | 'duration' | 'money' | 'scale'
  unit?: string
  target?: number
  direction?: 'up' | 'down'
  aggregate?: 'sum' | 'last'
}

export type RawEvent = { source: string; externalId: string; at: Date; body: unknown }

export type ConnectorCtx = {
  user: User
  cursor: unknown
  setCursor(c: unknown): void
  emit(e: RawEvent): Promise<void>
  log(msg: string): void
}

/** One input in the Connect dialog. `env` is the variable the connector reads. */
export type SetupField = {
  env: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  hint?: string
}

export type Connector = {
  id: string
  name: string
  category: Category
  /** One sentence for the Connectors card: what flows in. */
  description: string
  /** Short capability chips, most important first, e.g. ['Commits', 'Pull requests']. */
  provides: string[]
  /** Inputs for the Connect dialog. Saved encrypted, or taken from .env when left blank. */
  fields: SetupField[]
  /** Required env vars. Any missing = connector disabled (never crashes). */
  env: string[]
  everyMinutes: number
  sync(ctx: ConnectorCtx): Promise<void>
}

export type ParserCtx = { user: User; db: Db }

export type Parser = {
  id: string
  /** Updates existing rows instead of returning records, so an empty result still means "parsed". */
  enriches?: boolean
  match(e: RawEvent): boolean
  parse(e: RawEvent, ctx: ParserCtx): Rec[] | Promise<Rec[]>
}

export type Alert = {
  /** Same key = same alert; sent at most once per day. */
  key: string
  title: string
  body: string
  category?: Category
}

export type Rule = {
  id: string
  /** cron expression, evaluated in the user's timezone */
  every: string
  check(ctx: { user: User; db: Db; now: Date }): Promise<Alert[]>
}
