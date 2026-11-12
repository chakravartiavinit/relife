import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// The site's own database. It holds waitlist rows only, never user data from the app.
export const waitlistSignups = pgTable('waitlist_signups', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(), // join order
  email: text('email').notNull().unique(), // trimmed, lower-cased
  status: text('status', { enum: ['pending', 'confirmed'] }).notNull().default('pending'),
  tokenHash: text('token_hash').notNull().unique(), // sha256 of the /w/<token> secret
  refCode: text('ref_code').notNull().unique(), // 8 chars, public, for ?ref=
  referredBy: uuid('referred_by').references((): AnyPgColumn => waitlistSignups.id, { onDelete: 'set null' }),
  referralCount: integer('referral_count').notNull().default(0), // confirmed referrals, capped
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  platforms: text('platforms').array().notNull().default(sql`'{}'::text[]`),
  source: text('source'),
  utm: jsonb('utm').$type<Record<string, string>>(),
  consentVersion: text('consent_version').notNull(),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
})

// Rate limiting. Rows older than 24 h are deleted by the daily cron.
export const waitlistAttempts = pgTable('waitlist_attempts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  ipHash: text('ip_hash').notNull(),
  emailHash: text('email_hash'),
  kind: text('kind', { enum: ['submit', 'send'] }).notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('waitlist_attempts_ip_at').on(t.ipHash, t.at), index('waitlist_attempts_email_at').on(t.emailHash, t.at)])

export type Signup = typeof waitlistSignups.$inferSelect
