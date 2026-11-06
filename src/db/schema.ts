import {
  pgTable, uuid, text, timestamp, numeric, boolean, jsonb, date, integer, uniqueIndex, index, customType,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })
// Postgres numeric comes back as string; keep it as number in app code.
const num = (name: string) =>
  customType<{ data: number; driverData: string }>({
    dataType: () => 'numeric(20,8)',
    fromDriver: (v) => Number(v),
    toDriver: (v) => String(v),
  })(name)

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)
const userId = () => uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
const stamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})
const meta = () => jsonb('meta').$type<Record<string, unknown>>().notNull().default({})

export const CATEGORIES = ['health', 'mind', 'skills', 'wealth', 'relationships'] as const
export type Category = (typeof CATEGORIES)[number]

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  baseCurrency: text('base_currency').notNull().default('INR'),
  profile: jsonb('profile').$type<{ goals?: string; constraints?: string; notes?: string }>().notNull().default({}),
  ...stamps(),
})

export const trackers = pgTable('trackers', {
  id: id(),
  userId: userId(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  category: text('category').$type<Category>().notNull(),
  kind: text('kind').$type<'bool' | 'number' | 'duration' | 'money' | 'scale'>().notNull().default('number'),
  unit: text('unit'),
  target: num('target'),
  direction: text('direction').$type<'up' | 'down'>().notNull().default('up'),
  // how a day's value is combined when several entries arrive for the same source
  aggregate: text('aggregate').$type<'sum' | 'last'>().notNull().default('sum'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...stamps(),
}, (t) => [uniqueIndex('trackers_user_slug').on(t.userId, t.slug)])

export const entries = pgTable('entries', {
  id: id(),
  userId: userId(),
  trackerId: uuid('tracker_id').notNull().references(() => trackers.id, { onDelete: 'cascade' }),
  localDate: date('local_date').notNull(),
  value: num('value').notNull(),
  source: text('source').notNull().default('manual'),
  verified: boolean('verified').notNull().default(false),
  note: text('note'),
  meta: meta(),
  ...stamps(),
}, (t) => [
  uniqueIndex('entries_tracker_date_source').on(t.trackerId, t.localDate, t.source),
  index('entries_user_date').on(t.userId, t.localDate),
])

export type ScheduleKind = 'routine' | 'medicine' | 'subscription' | 'bill' | 'renewal'
export const schedules = pgTable('schedules', {
  id: id(),
  userId: userId(),
  name: text('name').notNull(),
  kind: text('kind').$type<ScheduleKind>().notNull(),
  category: text('category').$type<Category>().notNull(),
  rrule: text('rrule').notNull(), // RFC 5545, DTSTART in user's local wall time (see domain/recurrence.ts)
  remindOffsetMin: integer('remind_offset_min').notNull().default(0), // minutes before occurrence
  target: num('target'),
  unit: text('unit'),
  amount: num('amount'),
  currency: text('currency'),
  active: boolean('active').notNull().default(true),
  // medicine: { dose, stock, refillAt }  subscription: { plan, paymentMethod, url }
  meta: meta(),
  ...stamps(),
})

export const reminders = pgTable('reminders', {
  id: id(),
  scheduleId: uuid('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  occurrence: timestamp('occurrence', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  telegramMessageId: integer('telegram_message_id'),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
}, (t) => [uniqueIndex('reminders_schedule_occ').on(t.scheduleId, t.occurrence)])

export const checks = pgTable('checks', {
  id: id(),
  scheduleId: uuid('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  occurrence: timestamp('occurrence', { withTimezone: true }).notNull(),
  localDate: date('local_date').notNull(),
  status: text('status').$type<'done' | 'skipped'>().notNull(),
  value: num('value'), // progress toward target, e.g. ml of water
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('checks_schedule_occ').on(t.scheduleId, t.occurrence)])

export const accounts = pgTable('accounts', {
  id: id(),
  userId: userId(),
  key: text('key').notNull(), // stable id used by parsers, e.g. 'axis:1234', 'binance'
  kind: text('kind').$type<'bank' | 'card' | 'exchange' | 'wallet' | 'broker' | 'manual_asset' | 'loan'>().notNull(),
  name: text('name').notNull(),
  institution: text('institution'),
  currency: text('currency').notNull().default('INR'),
  latestBalance: num('latest_balance'),
  balanceAt: timestamp('balance_at', { withTimezone: true }),
  meta: meta(),
  ...stamps(),
}, (t) => [uniqueIndex('accounts_user_key').on(t.userId, t.key)])

export const transactions = pgTable('transactions', {
  id: id(),
  userId: userId(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
  localDate: date('local_date').notNull(),
  amount: num('amount').notNull(), // signed: negative = money out
  currency: text('currency').notNull(),
  merchant: text('merchant'),
  upiId: text('upi_id'),
  category: text('category'),
  source: text('source').notNull(),
  externalRef: text('external_ref').notNull(),
  rawEventId: uuid('raw_event_id'),
  meta: meta(),
  ...stamps(),
}, (t) => [
  uniqueIndex('transactions_source_ref').on(t.userId, t.source, t.externalRef),
  index('transactions_user_date').on(t.userId, t.localDate),
])

export const merchantRules = pgTable('merchant_rules', {
  id: id(),
  userId: userId(),
  pattern: text('pattern').notNull(), // lowercase substring matched against merchant or upi id
  merchant: text('merchant').notNull(),
  category: text('category').notNull(),
  ...stamps(),
}, (t) => [uniqueIndex('merchant_rules_user_pattern').on(t.userId, t.pattern)])

export const trades = pgTable('trades', {
  id: id(),
  userId: userId(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
  symbol: text('symbol').notNull(), // BASE/QUOTE
  side: text('side').$type<'buy' | 'sell'>().notNull(),
  qty: num('qty').notNull(),
  price: num('price').notNull(),
  fee: num('fee').notNull().default(0),
  feeAsset: text('fee_asset'),
  kind: text('kind').$type<'spot' | 'p2p' | 'convert' | 'futures'>().notNull().default('spot'),
  source: text('source').notNull(),
  externalRef: text('external_ref').notNull(),
  meta: meta(),
  ...stamps(),
}, (t) => [uniqueIndex('trades_source_ref').on(t.userId, t.source, t.externalRef)])

export const holdings = pgTable('holdings', {
  id: id(),
  userId: userId(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  asset: text('asset').notNull(),
  qty: num('qty').notNull(),
  priceUsd: num('price_usd'),
  at: timestamp('at', { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex('holdings_account_asset').on(t.accountId, t.asset)])

export const learningItems = pgTable('learning_items', {
  id: id(),
  userId: userId(),
  title: text('title').notNull(),
  provider: text('provider'),
  url: text('url'),
  cost: num('cost'),
  currency: text('currency'),
  status: text('status').$type<'planned' | 'active' | 'paused' | 'done'>().notNull().default('active'),
  progressDone: integer('progress_done').notNull().default(0),
  progressTotal: integer('progress_total'),
  minutesLogged: integer('minutes_logged').notNull().default(0),
  targetDate: date('target_date'),
  scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
  ...stamps(),
})

export const people = pgTable('people', {
  id: id(),
  userId: userId(),
  name: text('name').notNull(),
  relation: text('relation'),
  contactEveryDays: integer('contact_every_days'),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  notes: text('notes'),
  ...stamps(),
})

export const rawEvents = pgTable('raw_events', {
  id: id(),
  userId: userId(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  body: jsonb('body').$type<unknown>().notNull(),
  status: text('status').$type<'new' | 'parsed' | 'ignored' | 'failed'>().notNull().default('new'),
  parserId: text('parser_id'),
  error: text('error'),
  ...stamps(),
}, (t) => [
  uniqueIndex('raw_events_source_ext').on(t.userId, t.source, t.externalId),
  index('raw_events_status').on(t.status),
])

export const connections = pgTable('connections', {
  id: id(),
  userId: userId(),
  connectorId: text('connector_id').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  cursor: jsonb('cursor').$type<unknown>(),
  secretsEncrypted: bytea('secrets_encrypted'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  status: text('status').$type<'ok' | 'error' | 'disabled' | 'never'>().notNull().default('never'),
  failures: integer('failures').notNull().default(0),
  lastError: text('last_error'),
  ...stamps(),
}, (t) => [uniqueIndex('connections_user_connector').on(t.userId, t.connectorId)])

export const syncRuns = pgTable('sync_runs', {
  id: id(),
  connectorId: text('connector_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ok: boolean('ok'),
  error: text('error'),
  eventsCount: integer('events_count').notNull().default(0),
})

export const insights = pgTable('insights', {
  id: id(),
  userId: userId(),
  kind: text('kind').$type<'nudge' | 'review' | 'plan' | 'alert'>().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  // proposed actions the user can approve, e.g. [{ type: 'schedule', ... }]
  payload: jsonb('payload').$type<{ actions?: ProposedAction[]; dedupeKey?: string }>().notNull().default({}),
  status: text('status').$type<'pending' | 'accepted' | 'dismissed' | 'done'>().notNull().default('pending'),
  sourceRunId: uuid('source_run_id'),
  ...stamps(),
}, (t) => [index('insights_user_status').on(t.userId, t.status)])

export type ProposedAction =
  | { type: 'schedule'; name: string; kind: ScheduleKind; category: Category; rrule: string; target?: number; unit?: string }
  | { type: 'tracker'; slug: string; name: string; category: Category; kind: 'bool' | 'number' | 'duration' | 'money' | 'scale'; unit?: string; target?: number; direction?: 'up' | 'down' }

export const plans = pgTable('plans', {
  id: id(),
  userId: userId(),
  goal: text('goal').notNull(),
  horizon: text('horizon'),
  status: text('status').$type<'active' | 'done' | 'abandoned'>().notNull().default('active'),
  insightId: uuid('insight_id').references(() => insights.id, { onDelete: 'set null' }),
  ...stamps(),
})

export const llmRuns = pgTable('llm_runs', {
  id: id(),
  task: text('task').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  ms: integer('ms'),
  ok: boolean('ok').notNull(),
  request: jsonb('request').$type<unknown>(),
  response: jsonb('response').$type<unknown>(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const fxRates = pgTable('fx_rates', {
  date: date('date').notNull(),
  quote: text('quote').notNull(), // rate = units of quote per 1 USD
  rate: num('rate').notNull(),
}, (t) => [uniqueIndex('fx_rates_date_quote').on(t.date, t.quote)])

export const heartbeats = pgTable('heartbeats', {
  name: text('name').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
})
