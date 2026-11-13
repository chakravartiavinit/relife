# ReLife — System Design

> A second chance at life, built from small daily changes. Track everything across
> Health, Mind, Skills, Wealth and Relationships, automate what can be automated,
> and let an LLM of your choice turn the data into plans and nudges.

Status: v0 design, personal local-first build. Public open-source release comes later.

---

## 1. Requirements

### 1.1 Functional

| # | Requirement | Category |
|---|---|---|
| F1 | Binance: trades (spot, P2P, convert), deposits/withdrawals, holdings, FIFO P&L | Wealth |
| F2 | Spending from UPI/cards (Zepto, Zomato, Blinkit, etc.), categorized, plus near-live balance for Axis accounts | Wealth |
| F3 | GitHub: daily commits, PRs, reviews, streaks | Skills |
| F4 | Manual learning items (courses, subscriptions like boot.dev): cost, progress, time logged | Skills |
| F5 | Routines with reminders (water, skincare daily/weekly/monthly) and done/missed tracking | Health / Mind |
| F6 | Medicines: dose, schedule, stock, refill alerts, adherence | Health |
| F7 | Sleep tracking without a wearable (iPhone only) | Health |
| F8 | Subscriptions (Claude, Netflix, Amazon…): multi-currency, renewal reminders | Wealth |
| F9 | Ad-hoc trackers and connectors can be added with minimal code (often none) | Platform |
| F10 | Bring-your-own-key LLM for parsing, nudges, weekly reviews, plans and "ask your data" | Platform |
| F11 | Telegram bot for reminders and one-tap logging | Interface |
| F12 | Dashboard (web now; desktop and mobile later) | Interface |

### 1.2 Non-functional

| Concern | Target |
|---|---|
| **UI quality** | **Non-negotiable: exceptional.** Every surface (web, desktop, mobile) follows the design system in §8. |
| Logging friction | Any daily log in ≤ 2 taps (Telegram) or ≤ 3 keystrokes (⌘K on dashboard). |
| Privacy | All data stays on the local machine. Only the LLM provider you configure sees summaries; local models are supported. |
| Reliability | Nothing lost when the laptop is asleep or off: sources queue, syncs catch up from a cursor. |
| Idempotency | Every sync and parse can be re-run safely. |
| Extensibility | New connector or parser = 1 file + 1 line. New tracker or schedule = 0 code. |
| Cost | ₹0 infra locally. LLM spend visible per call. |

### 1.3 Constraints and assumptions

- Solo developer, TypeScript.
- Devices: MacBook (always the server for now), iPhone, no wearable.
- Bank: Axis (mostly). Country: India. Currency base: INR.
- Account Aggregator is not available to individuals → bank data comes from SMS, email and statements.
  *Update, Nov 2026: bank SMS and email parsing is switched off; spending comes only from the connected order apps
  (Zomato, Swiggy, Blinkit, Zepto, Flipkart, Amazon, MakeMyTrip). Payments to people aren't tracked.*
- Zepto/Zomato/Blinkit have no public APIs → order emails first; logged-in web session scraping is personal-only and never shipped publicly.
- Single user now, but every table carries `user_id` so multi-user is a small change later.

---

## 2. High-level architecture

```
                         ┌────────────────────────── MacBook ──────────────────────────┐
  iPhone                 │                                                             │
  ┌──────────────────┐   │   ┌─────────────────┐        ┌──────────────────────────┐   │
  │ Shortcuts         │──iCloud Drive──────────────────▶│ worker                   │   │
  │  · bank SMS       │   │   │                 │        │  · inbox watcher (1 min) │   │
  │  · steps / sleep  │   │   │  web (Next.js)  │        │  · connectors (cron)     │   │
  │  · share sheet OCR│   │   │  · dashboard UI │        │  · parsers               │   │
  └──────────────────┘   │   │  · server actions│        │  · reminder loop (1 min) │   │
  ┌──────────────────┐   │   │  · /api/ingest  │        │  · rules (alerts)        │   │
  │ Telegram app     │◀─────── Telegram API ─────long poll─▶ · telegram bot (grammY)│   │
  └──────────────────┘   │   └───────┬─────────┘        │  · AI jobs               │   │
  ┌──────────────────┐   │           │                  └────────────┬─────────────┘   │
  │ Browser / PWA    │──Tailscale──▶ │                               │                 │
  └──────────────────┘   │           ▼                               ▼                 │
                         │      ┌──────────────────────────────────────────┐           │
                         │      │ Postgres (Docker)                        │           │
                         │      └──────────────────────────────────────────┘           │
                         └───────────────────────────┬─────────────────────────────────┘
                                                     │ HTTPS (read-only keys)
                     Binance · GitHub · Gmail · CoinGecko/FX · LLM provider (BYOK)
```

Two processes, one repo, one database:

- **web**: Next.js App Router. Renders the dashboard, mutates via server actions, exposes a tiny HTTP surface (`/api/ingest`, `/api/health`).
- **worker**: long-running Node process. Runs the bot and the job scheduler; every time-based or event-driven task
  (syncs, parsing, reminders, rules, XP, AI) is a job in `apps/web/src/jobs/index.ts`.

**Surfaces and devices.** Besides the dashboard in a browser, four more things talk to the same server: the Chrome extension, the native Mac app, the phone (an installable PWA now, native later) and shell scripts. Each one is a *device*: a row in `devices` holding a hashed, revocable token. Browsers carry it in a cookie, native clients send it as a bearer token. Devices join through one pairing protocol (scan a QR from a signed-in screen, or show a code a signed-in screen approves). The HTTP shapes live in `packages/contract` as zod schemas, with JSON fixtures that the Swift tests decode, so the web server, the extension and the Mac app cannot drift apart. (Devices and pairing are planned; the contract package and the monorepo layout below land first.)

```
  Browser / PWA ─┐
  Chrome extension ─┤  cookie or bearer token       ┌─ web (Next.js, apps/web) ─ Postgres
  ReLife for Mac ───┼──────── /api/v1 (contract) ──▶│      + worker
  Shell (signin) ───┘                               └─ pairing, devices, events (SSE)
```

Why split: Next.js request handlers are not a good home for long-lived loops (bot polling, timers). Keeping them in a worker means the dashboard can restart freely without dropping reminders.

---

## 3. Data flow

### 3.1 Ingest pipeline (all external data)

```
 source                    store as-is                understand              persist
 ───────────────────────   ─────────────────────────  ──────────────────────  ─────────────────
 connector.sync()  ─┐
 iCloud inbox file ─┼──▶  raw_events                ──▶ parsers[] (first match) ──▶ entries
 Gmail             ─┤     unique(source, external_id)    rules → regex → LLM       transactions
 Telegram message  ─┤     status: new|parsed|failed      fallback last             trades
 /api/ingest       ─┘                                                              checks
```

- Fetching and parsing are separate so one parser serves many sources (Axis debit via SMS, email or screenshot) and raw data can be re-parsed when a parser improves.
- Dedup at `raw_events(source, external_id)`. For inbox lines without an id, `external_id = sha256(line)`.
- Records upsert on natural keys (e.g. `transactions(source, external_ref)`), so re-runs never double count.
- Failed parses stay `failed` with the error; they show up in a "Needs review" list on the dashboard.

### 3.2 Reminder loop

```
every minute:
  for schedule in schedules where active:
     occurrences = rrule.between(last_tick, now)           # in user's timezone
     for occ in occurrences (minus remind_offset):
        if no reminder row for (schedule, occ): send Telegram msg with buttons, insert reminder row
button tap → checks upsert (schedule_id, occurrence) done|skipped|snoozed
```

Catch-up policy after downtime: occurrences missed in the last 12 hours are collapsed into one "You missed while offline" digest message instead of a burst.

### 3.3 AI loop

```
cron (daily 08:00, weekly Sun 21:00) ──▶ context.ts builds digest (stats, trends, streaks,
                                         spend by category, adherence) + profile + past insights
                                    ──▶ generateObject(model('plan'), zod schema)
                                    ──▶ insights rows (pending) ──▶ Telegram with Approve/Dismiss
Approve ──▶ creates schedules / trackers (plans reuse the reminder engine)
```

Chat (`/ask` in Telegram, ⌘K "Ask" in dashboard) uses bounded, user-scoped metric, spending, portfolio, people, learning and quest tools, plus pending-only schedule suggestions. No general SQL tool is exposed. See `docs/AI_COACH.md` for current evidence, runtime and recovery policies.

---

## 4. Data model

All tables: `id uuid pk`, `user_id uuid`, `created_at`, `updated_at`. `meta jsonb` is the escape hatch for ad-hoc fields; a field gets promoted to a column only when it needs to be queried.

```
users            id, name, timezone ('Asia/Kolkata'), base_currency ('INR'), profile jsonb

trackers         slug unique per user ('water', 'github.commits'), name, category
                 (health|mind|skills|wealth|relationships), kind (bool|number|duration|money|scale),
                 unit, target, direction (up|down), archived_at
entries          tracker_id, local_date, value numeric, source ('manual'|'github'|...),
                 verified bool, note, meta  · unique(tracker_id, local_date, source)

schedules        name, kind (routine|medicine|subscription|bill|renewal), category, rrule text,
                 remind_offset interval, target numeric, unit, amount, currency, active, meta
                 (medicine: dose, stock, refill_at; subscription: plan, payment_method)
reminders        schedule_id, occurrence timestamptz, sent_at, telegram_message_id
                 · unique(schedule_id, occurrence)
checks           schedule_id, occurrence, status (done|skipped|snoozed), value, at
                 · unique(schedule_id, occurrence)

accounts         kind (bank|card|exchange|wallet|broker|manual_asset), name, institution,
                 currency, latest_balance, balance_at, meta
transactions     account_id, at, amount (signed), currency, merchant, upi_id, category,
                 source, external_ref, raw_event_id, meta  · unique(source, external_ref)
merchant_rules   pattern, category, merchant_name  (learned from your corrections)
trades           account_id, at, symbol, side, qty, price, fee, fee_asset, kind (spot|p2p|convert|futures),
                 external_ref · unique(account_id, external_ref)

learning_items   title, provider, cost, currency, status, progress_done, progress_total,
                 target_date, schedule_id (optional link to a subscription)
library_episodes item_id, key ('s1e5' or the title), title, number, season, duration_sec,
                 position_sec, watched_sec, first_at, last_at  · unique(item_id, key)

activity         source (browser|mac), domain or app, path, title, kind, started_at, ended_at,
                 seconds, local_date, meta  (deleted after 90 days; daily totals live in entries)
activity_rules   domain or 'app:<name>', kind, source ('user' wins | 'ai' sorted once)

raw_events       source, external_id, received_at, body jsonb|text, status, error, parser_id
                 · unique(source, external_id)
connections      connector_id, enabled, cursor jsonb, secrets_encrypted bytea, last_sync_at, status
sync_runs        connector_id, started_at, finished_at, ok, error, events_count

insights         kind (nudge|review|plan|alert), title, body, payload jsonb,
                 status (pending|accepted|dismissed|done), source_run_id
plans            goal, horizon, status, insight_id        (free-text plans from accepted plan insights)
coach_messages   role (user|assistant), text, channel (app|telegram), payload jsonb {sources, insightIds, error},
                 created_at   (the Ask conversation; kept 180 days by the coach-messages-prune job)
goals            title, reason, area, status (active|paused|finished), measure_kind (tracker|check_in),
                 tracker_id, measure_name, unit, direction (increase|decrease|range), target / range_low / range_high,
                 baseline_value, baseline_date, baseline_how, target_date, cadence, next_review_on,
                 actions jsonb [{kind: schedule|tracker, id}], source (user|ai_draft), insight_id, version
                 · at most 3 active; measure and baseline locked after start
goal_check_ins   goal_id, local_date, value, note       · unique(goal_id, local_date)
goal_reviews     goal_id, ref, kind (review|edit), review_date, snapshot jsonb, proposal jsonb, ai_note,
                 decision (keep|change|pause|finish|resume), decided_at, before / after jsonb
                 · unique(user_id, ref): one review per goal per day, one row per edit
llm_runs         task, model, tokens, ms, success/error category, safe finish/status metadata (new rows omit prompt/response text)
```

Money: amounts stored as `numeric(20,8)` in the original currency. Conversion to INR happens at read time using `fx_rates(date, base, quote, rate)` (daily, cached).

Time: every event stores a `timestamptz`; anything "per day" also stores `local_date` computed in the user's timezone so streaks never break at midnight UTC. Screens follow the same rule: dates, times and countdowns are formatted in the user's time zone (`core/time`), never the server's or the browser's, and a local `YYYY-MM-DD` is always formatted as a UTC calendar date so no offset can shift it a day. Sources that report in a fixed zone (Indian bank SMS, CodeChef) are read in that zone.

---

## 5. Extension points

Four kinds of plug-in, all the same shape: one file, one line in an explicit list in `index.ts`. No dynamic loading.

```ts
// apps/web/src/core/types.ts
export type Rec =
  | { kind: 'entry'; tracker: string; date: string; value: number; source: string; meta?: object }
  | { kind: 'transaction'; account: string; at: Date; amount: number; currency: string;
      merchant?: string; upiId?: string; balance?: number; externalRef: string; meta?: object }
  | { kind: 'trade'; account: string; at: Date; symbol: string; side: 'buy' | 'sell';
      qty: number; price: number; fee: number; feeAsset: string; externalRef: string }
  | { kind: 'check'; schedule: string; occurrence: Date; status: 'done' | 'skipped' }

export type RawEvent = { source: string; externalId: string; at: Date; body: string | object }

export type Connector = {
  id: string
  env: string[]                  // missing any → connector disabled, no crash
  everyMinutes: number
  sync(ctx: { cursor: unknown; emit(e: RawEvent): Promise<void>; setCursor(c: unknown): void }): Promise<void>
}

export type Parser = { id: string; match(e: RawEvent): boolean; parse(e: RawEvent): Rec[] | Promise<Rec[]> }

export type Rule = { id: string; every: string /* cron */; check(db: Db): Promise<Alert[]> }

export type AiJob = { id: string; every: string; run(ctx: AiCtx): Promise<void> }
```

| Need | Where | Code |
|---|---|---|
| New metric | dashboard or `/log coffee 2` (tracker auto-created on first use) | none |
| New recurring thing | schedule form | none |
| New API source | `connectors/<id>.ts` | 1 file |
| New message format | `parsers/<id>.ts` + sample in `parsers/fixtures/` | 1 file + 1 sample |
| New alert | `rules/<id>.ts` | 1 file |
| New LLM job | `ai/jobs/<id>.ts` | 1 file |

Testing: one `parsers.test.ts` loops over `fixtures/*.{txt,json}` and compares against `*.expected.json`. Adding a format = adding a sample. Same pattern for FIFO P&L (`pnl.test.ts`) and rrule occurrence logic.

---

## 6. Source-specific designs

| Source | Mechanism | Notes |
|---|---|---|
| Binance | `ccxt` + raw REST for P2P (`/sapi/v1/c2c/orderMatch/listUserOrderHistory`) and convert history | Read-only key, IP-restricted. One-time CSV backfill. Spot `myTrades` is per symbol → derive symbol list from balances + backfill. FIFO lots computed in `wealth/pnl.ts`. |
| Axis SMS | iOS Shortcuts automation ("message contains debited/credited", Run Immediately) → *Append to Text File* in iCloud Drive `relife/inbox.txt` | Mac reads `~/Library/Mobile Documents/com~apple~CloudDocs/relife/inbox.txt` from a stored byte offset. Works with laptop off. Parser built from real samples. |
| Gmail | OAuth (read-only scope), query by sender | Axis alerts, statement PDFs, Zomato/Zepto/Blinkit order emails, pre-debit mandate emails. Refresh token encrypted in `connections.secrets_encrypted`. |
| GitHub | Fine-grained PAT, GraphQL `contributionsCollection` plus REST commit search | Daily commits/PRs/reviews/issues → entries. The last 14 days of commits come from search by local date, because the contribution graph lags and groups days in US Pacific time. |
| Laptop activity | Chrome extension (MV3) posting to `/api/activity` with a bearer token (the same token lets its popup read and update Today through `/api/companion`: level, quests, routine checks, goal adds, quick log); worker polls the front Mac app with `lsappinfo` | Stretches of focused time, sorted by kind (built-in list, then AI once, then your pick). Episodes of shows and courses are read from JSON-LD, meta tags or the series link and logged to `library_episodes`. Uploads are clipped and batched so one bad page can't block the queue. |
| Steps / sleep | Shortcuts: 23:55 "Find Health Samples" (steps); "Sleep Focus on/off" and "Alarm stopped" automations | Appended to the same inbox file. `/sleep` and `/wake` in Telegram as fallback. |
| Share sheet | Shortcut: Extract Text from Image → inbox | Universal fallback for screenshots of orders/bills. |
| Telegram | `grammY`, long polling | Responds **only** to `TELEGRAM_ALLOWED_CHAT_ID`. |
| Quick-commerce sessions | Playwright login + cookie reuse (optional, personal only) | Against ToS; flagged off by default, never in public build. Polling every few hours at most. |

---

## 7. Interfaces

### 7.1 HTTP surface (web)

| Route | Auth | Purpose |
|---|---|---|
| server actions | device cookie | all dashboard reads/writes |
| `POST /api/ingest` | bearer `INGEST_TOKEN` (a legacy `ingest`-scope device) | optional direct push from Shortcuts over Tailscale |
| `GET /api/health` | none (localhost) | DB reachable, worker heartbeat age, last sync per connector |
| `/api/activity`, `/api/companion` | bearer `ACTIVITY_TOKEN` (a legacy `companion`-scope device) or a device token | the Chrome extension (time, and the popup's Today tab); validated with `@relife/contract` |
| `/api/v1/*` | device cookie or bearer token (`pair/*` and `hello` are open) | one versioned API for every device: `hello`, `me`, `today`, `activity`, `devices`, `events` (SSE), `pair/*` (offers, requests, redeem, poll, approve). Shapes are zod schemas in `packages/contract`. `/api/activity` and `/api/companion` stay as aliases while old extensions exist, with the same code behind both (`src/core/v1`). |

The worker writes a heartbeat row every minute; the dashboard shows a banner if it is older than 3 minutes.

### 7.2 Telegram commands

`/today` · `/log <tracker> <value>` · `/spent <amount> <note>` · `/sleep` · `/wake` · `/ask <question>` · inline buttons on reminders: `✅ Done` `⏭ Skip` `⏰ +30m` `+250ml`.

### 7.3 Dashboard information architecture

```
Today            sky header (time of day) · capsule progress per category · due checks · quick log
Health           sleep, steps, water, medicines, routines
Mind             mood, screen time, journal
Skills           GitHub, learning items, practice time
Wealth           net worth · Spending (category, merchant, trends) · Portfolio (Binance P&L)
                 · Subscriptions (next due, monthly/yearly total)
People           people, last contacted, quality time (/people)
Life             hub: every area this week, one click each (/life)
Time             laptop time from the extension and the Mac watcher (/time)
Plan             Goals (up to 3 outcome goals: baseline → now → target, linked actions) · Routines · Trackers ·
                 Review (weekly decisions)  (/plan, /plan/routines, /plan/trackers, /plan/review)
Coach            Needs you (decisions + data to sort, one queue) · Ask your data (one thread shared with
                 Telegram) · Patterns · History  (/coach, /coach/patterns, /coach/history, ?filter=decisions|data)
You              Progress · Connections · Notifications · Settings (profile, LLM models, theme)  (/you, /you/*)
⌘K               log anything, jump anywhere, ask your data
```

---

## 8. UI system (non-negotiable quality bar)

### 8.1 Platform strategy

| Surface | Now | Later | Shares |
|---|---|---|---|
| Web dashboard | Next.js + Tailwind v4 + shadcn/ui (Radix) + `motion` | — | tokens, components, domain logic |
| Mobile | PWA (installable via Tailscale HTTPS) | Expo (needed for HealthKit) or Capacitor | tokens (`tokens.json`), domain logic, API |
| Desktop | Native SwiftUI Mac app (`apps/mac`, planned) | — | tokens (`Tokens.swift`), the `/api/v1` contract |
| Extension | Chrome MV3 (`apps/extension`) | Firefox/Safari | tokens (`tokens.css`), the contract (types via JSDoc) |

Rule that keeps every surface consistent: **design tokens live in one file** (`packages/tokens/tokens.json`) and `npm run tokens` compiles them into CSS (web, site, extension), a Swift file (Mac app) and the JS easing curves; `apps/web/src/ui/tokens.ts` keeps the chart mappings that point at those CSS variables. Domain logic (P&L, streaks, rrule, formatting) is pure TypeScript with no React imports, so any client can reuse it (it stays in `apps/web` until a second TypeScript client needs it).

Trade-off to decide at mobile time: Expo gives the best native feel and HealthKit, but means re-implementing components against the same tokens. Capacitor reuses the web UI exactly but feels less native. Defer until M7+.

### 8.2 Brand: ReLife theme

Sky and sakura, tuned for UI:

| Token | Hex | Source / use |
|---|---|---|
| `ink` | `#111111` | wordmark black; primary text, wordmark |
| `pill-blue` | `#3B8BCC` | capsule + kana blue; primary action, links, focus ring |
| `line-blue` | `#61A6DF` | line-art sketches; illustrations, chart gridlines (low opacity) |
| `sky` | `#6DCFFF` → `#D4EFFF` | sky gradient; Today header (light), highlights |
| `sakura` | `#FEBED9` | blossom pink; celebration, streaks, accents |
| `sakura-soft` | `#FED3E6` / `#FBF2EB` | petals; subtle fills, selected rows |
| `cardigan` | `#EFE3C4` | uniform beige; warm neutral surface accents |
| `night` | `#212A33` | navy skirt; dark-mode base surface |

All tokens are defined in OKLCH in code, with separate light and dark values. Contrast is validated (WCAG AA, 4.5:1 for text) before use; `sakura` and `sky` are fills, never text colors on white.

Category colors (charts, chips, capsule fills), harmonized with the brand:

| Category | Hue |
|---|---|
| Health | sakura pink |
| Mind | lavender |
| Skills | pill blue |
| Wealth | cardigan gold (deepened for contrast) |
| Relationships | sky teal |

Logo: the wordmark with the "i" replaced by a capsule (blue top, white bottom, ink outline). App icon: the capsule on its own. Source: `packages/brand/logo/relife-logo.png`; `npm run brand` builds the light and dark logos, the app icons and the extension's toolbar icons (the capsule alone on transparent, also used in the README header). The capsule is also the core UI motif (below).

> IP note: the ReLIFE name, wordmark and capsule-"i" are from the anime (© YayoiSo/comico/ReLIFE Laboratory). The project uses the original logo as a fan tribute; it is excluded from the AGPL license (see README → Credits).

The project was briefly called Savepoint, with its own crystal logo, in November 2026, then went back to ReLife and the original logo. Internal names (the `relife` database, the iCloud `relife/inbox.txt` path, browser storage keys and event names) never changed.

### 8.3 Typography

- UI: **Inter** (variable), `tabular-nums` on every metric, money and time value.
- Display: a heavy geometric sans close to the wordmark (e.g. **Outfit** Black / ExtraBold) for page titles, big numbers and the wordmark itself.
- Optional accent: small katakana subtitle under the wordmark (リライフ) in pill blue, as on the poster.
- Money formatting: `Intl.NumberFormat('en-IN', { style: 'currency', currency })` for lakh/crore grouping; original currency shown alongside for USD subscriptions.

### 8.4 Signature motifs

- **Capsule progress**: every progress indicator (daily water, category completion, course progress) is a capsule that fills from the white half into the blue half. Same component on web, Telegram images (later) and mobile.
- **Sky header**: Today's header gradient follows the time of day (morning sky → day → dusk sakura → night navy). Static per page load; no animated background.
- **Line-art illustrations** in `line-blue` for empty states and onboarding, matching the poster's sketch style.
- **Petals**: a short, sparse sakura-petal burst when a streak milestone is hit or the whole day is complete. Rare by design. Disabled under `prefers-reduced-motion`.

### 8.5 Polish rules (enforced in review)

| Area | Rule |
|---|---|
| Radius | Concentric: outer = inner + padding. Scale: `--r-sm 8px`, `--r-md 12px`, `--r-lg 16px`, `--r-xl 20px`, capsules `9999px`. A card with 4px padding around a 12px control is 16px. |
| Depth | Layered transparent `box-shadow` for elevation; borders only for dividers, selected and focus states. |
| Press | `scale(0.96)` on buttons and tappable cards; `static` prop to disable. |
| Frequent interactions | Instant, or ≤ 150ms on `opacity`/`color` only. Checking a habit off must feel immediate. |
| Easing | `cubic-bezier(0.2, 0, 0, 1)`; springs `{ type: "spring", duration: 0.3, bounce: 0 }`. |
| Icon swaps | scale `0.25 → 1`, opacity `0 → 1`, blur `4px → 0px` (e.g. check ↔ circle on habits). |
| Enter | Stagger ~100ms only for the first Today view of the day (header → capsules → list). Everything else enters unstaggered. |
| Exit | Small fixed `translateY`, `ease-out`, softer than enter. |
| Page load | `AnimatePresence initial={false}`. |
| Theme switch | Inject `*{transition:none!important}`, reflow, remove next frame. |
| Transitions | Always name properties; never `transition: all`. `will-change` only to fix observed stutter. |
| Icons | One library (Lucide), `currentColor`, outline default, filled for active. Stroke `1.5px` next to 400 text, `2px` next to 600. Optical nudges for asymmetric glyphs. |
| Images | `1px` outline: `oklch(0 0 0 / 0.1)` light, `oklch(1 0 0 / 0.1)` dark. |
| Feedback | Every animated change also has a static cue (color, icon or label). |
| Accessibility | Keyboard-complete (⌘K, j/k lists, Enter to check), visible focus ring in pill blue, 44px touch targets, reduced-motion respected. |

### 8.6 UI quality gates

- `/dev/ui` route: every component in every state (hover, focus, active, loading, empty, error) in light and dark. This is the review surface; no Storybook.
- Every UI PR runs the `better-interface` review (accessibility, layout, typography, color, polish) and ships with light and dark screenshots of changed screens.
- Charts follow the `dataviz` skill: category hues from §8.2, tabular numbers, accessible tooltips.
- Performance budget: Today page interactive < 1s locally; no layout shift on load (skeletons sized to content).

---

## 9. Security and privacy

- Secrets in `.env` (gitignored from the first commit; `.env.example` committed). OAuth refresh tokens encrypted at rest with `ENCRYPTION_KEY` (AES-256-GCM, `node:crypto`).
- Exchange keys are read-only; the Binance connector checks key permissions on first sync and refuses keys that can trade or withdraw.
- Web binds to `127.0.0.1`; remote access only through Tailscale. No ports exposed to the internet. `apps/web/src/proxy.ts` refuses
  any Host besides loopback, `*.ts.net` and `RELIFE_ALLOWED_HOSTS`, so a web page can't reach ReLife through DNS rebinding.
- Sign-in (`RELIFE_MODE=self-host`, the default; `cloud` is a switch only, its emailed codes are not built): the Mac the server runs on is trusted on loopback (a loopback Host and no proxy headers, on a top-level page navigation only; Settings → Devices → "Require sign-in on this Mac" turns it off, and so does naming other hosts in `RELIFE_ALLOWED_HOSTS` or binding beyond loopback, `RELIFE_BIND`. Never put a tunnel or proxy in front that rewrites Host to localhost: every visitor would look like this Mac); every other device pairs once, by QR or code. No passwords. Shell access means ownership (`npm run signin` prints a one-time link and a terminal QR; set `RELIFE_PUBLIC_URL` when the address a phone must use is not the Tailscale name). A hosted cloud mode would add email sign-in codes and invites.
- Devices: a token is `rlf_<kind>_<32 random bytes>`, stored only as SHA-256, shown once, scoped (`full`, `companion`, `ingest`), revocable per device, expiring 180 days after last use. The extension gets only `companion`, so a stolen extension token cannot read wealth data or connector keys. The pre-commit hook blocks anything shaped like a device token.
- Pairing: codes are 8 Crockford base32 characters, single use, 2 minutes (offers) or 10 minutes (requests), a wrong guess never uses up anyone's live codes (that would let a stranger expire the owner's), and failed redeems are rate limited per caller: 20 per 10 minutes, counted against the address the proxy reports (the rightmost `X-Forwarded-For` hop, which our own proxy wrote), this Mac, or the tunnel name for a tunnel we do not trust. The QR secret travels in the URL fragment so it never reaches logs or link previews. The approve page names the device and where the request came from.
- Known limits of device sign-in, accepted for now:
  - Cookies are not port-isolated: another web app on `127.0.0.1` or `localhost` (any port) is sent the same session cookie when the browser visits it, and cookies from a sibling port can be overwritten. Run ReLife on a host name no other local app uses (`localhost` versus `127.0.0.1` are separate cookie jars) if that matters.
  - A revoke takes effect at once on the instance that handled it and within 30 seconds on any other (the lookup cache); the revoked browser's stream is closed by the `device.revoked` event.
  - The first hop of `X-Forwarded-For` is never trusted, but with a chain of several proxies the rightmost hop is the nearest proxy, not the visitor; rate limits then count the proxy. Set up one proxy (`tailscale serve`) or none.
- The key that encrypts saved connector keys lives in `data/secret.key` at the repo root (or `RELIFE_SECRET_KEY`). If it is missing while saved keys exist, ReLife refuses to start with a clear error instead of creating a new key.
- Telegram bot ignores every chat except `TELEGRAM_ALLOWED_CHAT_ID`.
- LLM: account numbers and UPI handles masked in digests by default; parsing can run on a local model (`LLM_PARSE=local:...`). Read tools enforce user scope in code; no model-written SQL runs. New AI logs store operational metadata, not prompt or response excerpts. Providers still receive selected context.
- Disk: FileVault on. Daily `pg_dump` to an encrypted folder.

---

## 10. Reliability and monitoring

| Failure | Handling |
|---|---|
| Laptop asleep/off | iCloud inbox and Gmail queue data; connectors resume from `connections.cursor`; reminders send a single catch-up digest. |
| Connector error | Recorded in `sync_runs`; retry with backoff on next tick; Telegram alert after 3 consecutive failures. |
| Parser miss | Regex parsers → LLM fallback → `raw_events.status = failed` → Coach "Data to sort". |
| LLM down / no key | AI jobs skip silently; rules still alert. |
| Worker dead | Heartbeat banner on dashboard; `launchd` agent restarts it on login. |

Observability is just tables: `jobs`, `sync_runs`, `llm_runs`, `raw_events.status`, heartbeat.

### Jobs

Every scheduled or event-driven task is one entry in `apps/web/src/jobs/index.ts`; the engine is `apps/web/src/core/jobs.ts`.

- **State in Postgres** (`jobs`): next run, last result, failures in a row, and a lease (`locked_until`). A run
  takes the lease with one conditional `UPDATE`, so the worker and the web's "Sync now" never run the same job
  at once. Leases of dead local processes are freed on the next tick; others expire after `timeoutMinutes`.
- **Schedules**: `{ everyMinutes }` (first run at once, so a new connector syncs immediately) or `{ cron }` in the
  user's time zone. A cron run missed while the worker was off runs once on start if within `catchUpMinutes`.
- **Requests and events**: `requestJob(id)` / `emit(event)` mark jobs to run now and wake the worker through
  Postgres `NOTIFY` (about half a second); a 15-second tick is the fallback. Events: `connector.connected:<id>`,
  `raw.added`, `data.changed`.
- **Backoff**: connector jobs wait failures × interval (at most 6 hours) after errors.
- **Concurrency**: up to 4 jobs at once, each in the background, so a long first sync never blocks the rest.
- **Ingest path**: a sync writes raw events in batches of 250 (`insert … on conflict do nothing`), then emits
  `raw.added`; the single `parse` job turns them into rows. Every derived table has a unique key
  (`source, external_ref` and the like), so re-running any sync or parse never duplicates data.

---

## 11. Load estimation

Single user: roughly 30 SMS + 20 emails + 50 manual logs + 100 connector events per day ≈ 200 raw events/day ≈ 75k/year, a few hundred MB including raw bodies. Postgres on a laptop handles this with no tuning; no caching layer is needed. Dashboards query directly, with SQL views for rollups (daily spend by category, tracker streaks).

---

## 12. Trade-offs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Web framework | Next.js | Vite SPA + Hono | Server actions remove a hand-written API layer; one deploy target later. Cost: heavier framework. |
| Database | Postgres (Docker) | SQLite | No migration when going multi-user; `jsonb`, roles for read-only LLM SQL. Cost: Docker dependency. |
| Reminders | Telegram bot | PWA push / native app | Free, works on iPhone today, two-way buttons, no public URL. Cost: dependence on Telegram. |
| Bank data | SMS (Shortcuts) + Gmail + statements | Account Aggregator | AA needs an RBI-regulated entity. Cost: near-live, not live; parsers to maintain. |
| iPhone bridge | Shortcuts → iCloud file | Native iOS app | Zero app to build, survives laptop downtime. Cost: Shortcuts setup is manual, one-time. |
| LLM access | Vercel AI SDK registry | Direct provider SDKs | Any provider by env var, structured output and tools across all. Cost: one abstraction layer. |
| LLM context | Precomputed digest (jobs) + tools (chat) | Dump raw data | Cheap, deterministic, fits context. Cost: digest code to maintain. |
| Desktop | Native SwiftUI | Tauri / Electron | Menu bar, global hotkeys, real Liquid Glass and Keychain are first-class; the web UI stays the deep-work surface. Cost: a second codebase, kept honest by the shared contract fixtures. |
| Repo layout | npm workspaces, no Turborepo | pnpm, Turborepo | Three JS apps and a few source-only packages: nothing to build or cache. Cost: revisit if CI gets slow. |
| Plug-ins | Explicit lists in `index.ts` | Dynamic plug-in loader | Greppable, typed, no magic. Revisit when strangers write connectors. |

---

## 13. What to revisit as it grows

| Trigger | Change |
|---|---|
| Going public | Auth, multi-tenant `user_id` enforcement (RLS), AGPL license, `ee/` folder, Docker Compose for full stack, rename + new logo, drop ToS-violating connectors. |
| Laptop downtime hurts | Move worker + DB to a Raspberry Pi or small VPS; nothing else changes. |
| Need Apple Health beyond Shortcuts | Native app (Expo or Capacitor) with HealthKit. |
| Real-time balance needed | Partner with a licensed Account Aggregator FIU. |
| Many connectors / contributors | Plug-in packages, per-connector process isolation, job queue (Inngest/BullMQ). |
| Many users | Paid aggregators (Plaid, Terra/Junction, SnapTrade) behind a Pro tier; per-user LLM budgets. |

---

## 14. Repository layout

```
relife/
  package.json                # workspace root: delegating scripts, git hooks (prepare)
  docker-compose.yml          # postgres
  .env  data/                 # runtime state of the self-hosted server (gitignored, stay at the root)
  AGENTS.md  CLAUDE.md        # repo-wide rules and the layout map
  .githooks/  docs/  plans/
  apps/
    web/                      # Next.js dashboard + worker (own AGENTS.md)
      src/
        app/                  # Next.js routes (today, health, mind, skills, wealth, ...)
          dev/ui/             # component states gallery
        ui/
          tokens.ts           # chart mappings onto the CSS token variables
          components/         # shadcn-based, themed: Capsule, Stat, Chart, ...
        db/schema.ts          # drizzle
        core/                 # types, ingest, upsert, fx, time (local_date), paths (data folder)
        domain/               # pure TS: pnl, streaks, rrule, money formatting
        connectors/  parsers/  rules/
        ai/                   # models, context, tools, jobs/
        bot/telegram.ts
        worker/               # entry: bot + cron + inbox watcher + heartbeat
      public/  scripts/       # static files; mock, seed-demo, binance-import, service.sh
    extension/                # Chrome MV3 extension, plain JS typed with JSDoc + checkJs
    mac/                      # native SwiftUI app (planned; Swift package, no package.json)
  packages/
    tokens/                   # tokens.json + build.mjs -> CSS, extension CSS, Swift
    contract/                 # zod schemas for /api/v1 + JSON fixtures shared with Swift tests
    brand/                    # name, tagline, logo source, build.mjs (icons), publicReady flag
```

---

## 15. Milestones

| M | Scope | Done when |
|---|---|---|
| M0 | Repo, Docker Postgres, Drizzle schema, tokens, `/dev/ui` skeleton, `CLAUDE.md` | `docker compose up && npm run dev` runs web + worker |
| M1 | Telegram bot + schedules engine (routines, water, medicines, subscriptions) | Used daily for 7 days |
| M2 | Dashboard v1: Today, schedules/trackers CRUD, subscriptions, tracker page, ⌘K | Everything managed from UI; passes `better-interface` review |
| M3 | Binance: trades, P2P, holdings, FIFO P&L | Portfolio matches Binance within fees |
| M4 | GitHub connector | Daily contributions match GitHub graph |
| M5 | iCloud inbox: Axis SMS parser, steps, sleep; Spending page | A month of spend categorized with < 5% manual fixes |
| M6 | Gmail: Axis alerts, order emails, pre-debit emails | Item-level food/grocery spend visible |
| M7 | AI: models registry, `/ask`, weekly review, rules | Weekly review produces at least one accepted suggestion |
