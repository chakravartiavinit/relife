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
      /**
       * 'add' accumulates into the same day (manual logs); default 'set'. 'fill' is for imported history: it never
       * touches a day that already has live data (another source, or this source without `meta.importId`) and
       * rewrites only the days an earlier import wrote, and only when the value changed.
       */
      mode?: 'set' | 'add' | 'fill'
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
      tradeKind?: 'spot' | 'p2p' | 'fiat' | 'convert' | 'dust' | 'futures'
      source: string
      externalRef: string
      meta?: Record<string, unknown>
    }
  | { kind: 'holding'; account: AccountRef; asset: string; qty: number; priceUsd?: number; at: Date }
  | { kind: 'balance'; account: AccountRef; amount: number; at: Date; /** Replaces the account's meta (e.g. open futures positions). */ meta?: Record<string, unknown> }
  | {
      /** Money moving in or out of an exchange account, or futures income. Signed: + into the account. */
      kind: 'flow'
      account: AccountRef
      at: Date
      flow: FlowKind
      asset: string
      amount: number
      usd?: number // value when it happened, signed like amount
      symbol?: string // futures contract, for P&L by symbol
      source: string
      externalRef: string
      meta?: Record<string, unknown>
    }

export type FlowKind = 'deposit' | 'withdrawal' | 'reward' | 'futures_pnl' | 'funding' | 'commission' | 'transfer' | 'other'

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

/** `replace`: a re-read with a different body replaces the stored one and parses it again (day summaries always do). */
export type RawEvent = { source: string; externalId: string; at: Date; body: unknown; replace?: boolean }

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

/**
 * Sign in with the service instead of pasting a token (OAuth 2.0 authorization code). ReLife runs on your
 * own machine, so you make a free app with the service once and paste its client ID and secret; the
 * Connect dialog shows the redirect address to register. Tokens are kept encrypted and refreshed by
 * src/core/oauth.ts.
 */
export type OAuthSpec = {
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  /** How scopes are joined in the authorize URL. Default ' '. */
  scopeSeparator?: string
  /** The fields holding the app's client ID and secret. */
  clientIdEnv: string
  clientSecretEnv: string
  /** Optional field with a pasted refresh token, used until you sign in (for setups without a browser). */
  refreshTokenEnv?: string
  /** Extra authorize parameters, e.g. Google's access_type=offline. */
  authParams?: Record<string, string>
  /** Extra token request parameters, e.g. Withings' action=requesttoken. */
  tokenParams?: Record<string, string>
  /** Where to create the app, shown in the Connect dialog. */
  setupUrl: string
  /** The service only accepts https redirect addresses (WHOOP): open ReLife over https to sign in. */
  httpsOnly?: boolean
}

export type Connector = {
  id: string
  name: string
  category: Category
  /** One sentence for the Connections card: what flows in. */
  description: string
  /** Short capability chips, most important first, e.g. ['Commits', 'Pull requests']. */
  provides: string[]
  /** Inputs for the Connect dialog. Saved encrypted, or taken from .env when left blank. */
  fields: SetupField[]
  /** Required env vars. Any missing = connector disabled (never crashes). */
  env: string[]
  /** Connects by logging in to the app in a browser window instead of pasting a key (shopping apps). */
  login?: { url: string }
  /** Connects by signing in with the service (OAuth). */
  oauth?: OAuthSpec
  /**
   * Where the data comes from, for the privacy page: `local` (this machine only), `lan` (a service on your network) or
   * `public` (an open service that is sent nothing about you). Missing means a third-party service, the cautious claim.
   */
  reach?: 'local' | 'lan' | 'public'
  everyMinutes: number
  sync(ctx: ConnectorCtx): Promise<void>
  /**
   * One cheap request that tests the keys or username before they're saved, so a typo shows in the Connect dialog
   * instead of as a failing sync later. `get` reads the values being saved (dialog input, saved value or .env).
   * Throw an Error with advice for a wrong key or username. Network trouble, timeouts, 429s and 5xx don't block
   * saving (see `isTransient` in core/secrets.ts).
   */
  check?(get: (env: string) => string | undefined): Promise<void>
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
  /** Send once a week per key instead of once a day. */
  weekly?: boolean
  /** Leading emoji in Telegram; defaults to a warning sign. */
  emoji?: string
  /** Notification category: 'alerts' (default) or 'analysis' for findings from your data. */
  channel?: 'alerts' | 'analysis'
  /** Small italic line under the title, e.g. "Wealth · This week". */
  meta?: string
  /** One thing to do, shown on its own line after the body. */
  action?: string
  /** Exact numbers behind it, one per line, in a tap-to-expand box. */
  data?: string[]
}

export type Rule = {
  id: string
  /** cron expression, evaluated in the user's timezone */
  every: string
  /** Events that also run it at once, e.g. 'data.changed'. */
  on?: string[]
  check(ctx: { user: User; db: Db; now: Date }): Promise<Alert[]>
}
