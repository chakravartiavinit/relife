<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ReLife: rules for working in this repo

This file is the single source of rules for people and coding agents (Claude Code reads it through
`CLAUDE.md`). `next dev` manages the block above; edit everything below it freely.

Design and decisions: `docs/SYSTEM_DESIGN.md`. Read it before structural changes.

## Layout

- Pages: Today (`/`, the quest log: things to do now), Goals (`/goals`, up to 3 outcome goals with a baseline, linked actions and weekly review decisions; `/goals/[id]` and `/goals/review`), Activity (`/activity`, laptop time from `extension/` and
  the Mac watcher), Progress (`/profile`, the character sheet: level, streak,
  week, consistency, achievements, XP; `/overview` redirects here), Habits, Insights, and six areas (Health, Mind, Skills, Wealth,
  Hobbies, People) that share one template (`AreaHeader` → `KpiStrip` → cards). Inbox, Connectors and Settings sit in the sidebar footer.
  Navigation lives in `src/ui/components/nav.tsx`. The game look comes from three banners: `CharacterBanner`
  (`hud.tsx`, Today and Progress), `AreaHeader` (area pages) and `PageHeader` (everything else). Routine
  pictures come from `src/ui/routine-icons.ts`.
- Look ("ReLife capsule"): ink black, white and the logo's capsule blue, light-first. The signature shapes are
  `CapsuleIcon` (`capsule-icon.tsx`, the tilted pill from the logo, for areas and avatars), `SystemLabel` (mono
  area label in `card.tsx`) and the `.halftone` dot texture in header corners. No other decorative textures.
- Motion: CSS easing tokens in `globals.css` (`--ease-out-quint`, `--ease-out-strong`, `--ease-in-out-strong`);
  JS twins in `src/ui/beui/lib/ease.ts` (`EASE_OUT`, `EASE_OUT_STRONG`). Never retype the curves. Audits and
  plans live in `plans/`.
- `src/app/`: Next.js 16 App Router pages and `actions.ts` (all server actions). Cache Components is
  on: DB reads go in an async child component that calls `await connection()`, wrapped in
  `<Suspense>` with a skeleton sized like the content. See `src/app/page.tsx`.
- `src/core/`: ingest pipeline, schedules, metrics, quick-log grammar, FX, time zones, connector keys.
- `src/domain/`: pure TypeScript (recurrence, streaks, FIFO P&L, money formatting). No DB, no React.
- `src/connectors/`, `src/parsers/`, `src/rules/`, `src/ai/jobs/`: the four extension points.
- `src/worker/`: long-running process (bot, laptop activity, job scheduler). `src/jobs/`: every scheduled job.
  `src/bot/`: Telegram.
- `src/ui/`: tokens and components. `src/app/globals.css` holds the design tokens.
- Logo: the original ReLIFE logo. `assets/brand/relife-logo.png` is the source;
  `node scripts/brand.mjs assets/brand/relife-logo.png` rebuilds `public/brand/` (light and dark logos and
  icons, with content-hashed names), `src/ui/brand-files.ts` (their paths), `src/app/icon.png` /
  `apple-icon.png` and the extension's toolbar icons (`extension/icons/`, the capsule alone on transparent; the
  README header uses the 128 px one). Use `Wordmark` (or `CapsuleMark` for the icon) from `src/ui/components/logo.tsx`;
  never redraw the logo.
- Name: the app is ReLife (it was briefly called Savepoint). Internal identifiers use `relife` too (database
  names, `relife:*` events and storage keys, the iCloud inbox path).
- Browser extension: `extension/` (MV3, plain scripts, no build step). Shared helpers in `extension/lib.js`; its icons
  come from `node scripts/extension-icons.mjs` (add a Lucide name there). It talks to `/api/activity` (time) and
  `/api/companion` (the popup's Today tab: character, quests, routine checks, goal adds, quick log), both behind
  the Laptop activity token (`src/core/companion.ts`). Popup tokens are copied into `extension/popup.css`; keep
  them in step with `globals.css`. Bump `manifest.json`'s version with each change.
- Vendored UI code: `src/ui/beui/` (beui.dev, installed from the `@beui` registry with imports rewritten
  to `@/ui/beui`). Change it only to fit ReLife tokens.
- Charts: [EvilCharts](https://evilcharts.com/docs), installed unmodified with `npx shadcn@latest add @evilcharts/recharts-<chart>`
  into `src/components/evilcharts/`. Never edit those files (re-run the add command to update them); adapt in the
  wrappers instead. Pages use the wrappers in `src/ui/components/charts.tsx`, one per kind of number: `TrendArea` (a measure
  over time), `DailyBars` (a count per day), `RankedBars` (a ranking), `ShareDonut` (shares of a whole),
  `Sparkline` (stat tiles), plus `StackedBars`. Habit adherence keeps its shape-coded strip.

## Adding things

- **New metric or routine:** no code. Use the UI, ⌘K (`coffee 2`) or Telegram. Trackers are created
  on first use.
- **New data source:** one file in `src/connectors/<id>.ts` implementing `Connector`
  (`src/core/types.ts`), added to the array in `src/connectors/index.ts`. Declare `fields` (the
  Connect dialog inputs) and required `env` keys, emit raw events with stable `externalId`s, store
  progress with `ctx.setCursor`, and add a `check(get)` that tests the key or username before it's saved. Give it a `description` and `provides` chips, add its id to a category in
  `GROUPS` (`src/ui/components/connector-market.tsx`; unlisted ones fall back to their life area), and
  optionally a logo in `public/connectors/` mapped in `src/ui/components/app-logo.tsx`. Document it in
  `docs/CONNECTORS.md` and `.env.example`.
- **New parser** (turns a connector's raw events into records): one file in `src/parsers/` added to
  `src/parsers/index.ts`, plus a fixture in `src/parsers/fixtures/` (`{ event, expected }`). `npm test` runs
  every fixture. Bank SMS and bank emails are not read: spending comes only from the connected order apps.
- **New alert:** one file in `src/rules/` added to `src/rules/index.ts` (add `on: ['data.changed']` to also run it when new data lands). Give the `Alert` an `emoji` that says the topic, a `meta`
  line ("Wealth · Today"), one `action` and the exact numbers in `data` (shown in the app and on "Why?", not in the message); `alertText` in `src/rules/run.ts` lays them out as a short, phone-notification-style message.
- **New Telegram message:** send it with `notify(user, category, …)` from `src/core/outbox.ts`, never `sendMessage`
  directly (only direct replies in `src/bot/telegram.ts` skip the outbox). The category (`reminders`, `alerts`,
  `analysis`, `coach`, `events`; rules in `src/domain/notify.ts`) decides quiet hours, daily caps and repeats until a
  button is tapped, as chosen in Settings → Notifications. Give messages with buttons a `ref` (`reminder:<id>`,
  `insight:<id>`) so repeats stop once it's handled in the app. Build text with the helpers in `src/bot/ui.ts`.
- **New achievement:** append to `src/achievements/index.ts`. `check` reads the shared stats and returns
  progress, so locked ones show how close you are.
- **New scheduled or event-driven job:** one entry in `JOBS` in `src/jobs/index.ts`: an `id`, a `schedule`
  (`{ cron }` in the user's time zone, or `{ everyMinutes }`) and `run()`. Add `on: ['some.event']` to also run it
  the moment `emit('some.event')` fires. The engine (`src/core/jobs.ts`) keeps one run at a time across the worker
  and the web, remembers next runs across restarts, catches up missed cron runs and backs off after failures.
  New connectors get a `sync:<id>` job automatically and sync as soon as they're connected.
- **New AI job:** `src/ai/jobs/<id>.ts`, added to `JOBS` in `src/jobs/index.ts`. Use `model(task)`
  from `src/ai` and log through `src/ai/run.ts`.
- **Outcome goals:** rules in `src/domain/goals.ts` (tested), wiring in `src/core/goals.ts`, UI in `src/ui/components/goals/`.
  Separate from `plans`. Every write locks the user row and checks `version`; the AI only drafts and proposes (see docs/AI_COACH.md).
- **Odd fields:** put them in the `meta` JSON column; promote to a real column only when queried.

## Data rules

- Per-day values are keyed by the user's local date (`core/time.localDate`), never UTC dates.
- Money is stored in its original currency; convert at read time with `core/fx.convert`.
- Re-running any sync or parse must be safe: dedupe on `(source, externalId)` / `externalRef`.
- Nothing syncs until the user connects it on /connectors. Keys typed there are stored encrypted in
  `connections.secrets_encrypted` and loaded into a key map (`core/secrets.ts`); `.env` only fills blanks.
- Keys can also come from a dotsafe vault: `npm run dev:vault` runs the app under `dotsafe run`, which injects
  them as environment variables (see docs/CONNECTORS.md). Never print or log their values.
- Read connector keys with `env()` from `core/env.ts`, never `process.env`. Never change `process.env` at
  runtime: inside `next dev` it makes Turbopack rebuild and reload the page in a loop.
- Server actions scope every write to `getUser()`.

## Gamification

- XP rules are pure functions in `src/domain/xp.ts` (tested); `src/core/xp.ts` turns days into
  `xp_events` rows. Every row has a unique `ref`, so rescoring a day replaces it instead of adding.
- Two kinds of XP: **consistency** (up to 100 a day split across whatever was due, so adding routines
  never raises the ceiling) and **standard** (fixed measures that mean the same for everyone).
  Synced data earns full XP, typed-in data half and at most 40 a day. Streak multiplier up to ×1.5.
- Fair play: a routine pays from the day after it was created; only today and yesterday are rescored.
- **The System** (Solo Leveling style) issues the daily quests: `src/core/system.ts` reads every signal from
  `src/core/patterns.ts`, the AI (`plan` model) picks what to train from the stats the user wants to improve
  (Settings → The System, `profile.improve`) and what's slipping, and words it. `src/domain/system.ts` (tested)
  keeps it fair: targets are clamped near the usual, ranks E–S come from how often past days met the target,
  quests you'd clear anyway are skipped, difficulty follows your clear rate, connector data clears quests, a
  recorded missed daily pauses new quests the next day and offers explicit recovery choices (smaller step, rest, priorities);
  late imports recheck yesterday all day, so a miss the data now meets clears and lifts the pause (never the reverse),
  and sharp bad changes can offer a modest corrective quest. Unknown measurements are not failures.
  It also reads spending habits from order items (impulse categories and items bought on many days, like a soft
  drink; `habitSignals` in `src/domain/basket.ts`): at most one habit quest a day, only when that habit is above
  its usual, never the one cleared yesterday (`balanceHabits`). A sudden spike can still call an emergency quest. Without an
  AI model the rule-based fallback sets the quests. Quests live in `system_quests`; the worker runs it every
  5 minutes and warns at 21:00 (notification category `system`).
- Weekly quests, chests and streak freezes: rules in `src/domain/quests.ts` (tested), wiring in `src/core/quests.ts`.
  Quests aren't stored: picks are seeded by date and progress is read from `xp_events`. Chests are earned once
  per `ref` and pay XP when opened; freezes cap at 2 and are spent automatically to save a streak.
- Keep per-event `kind` and `verified`: a future ranked view will count only standard, verified XP.
  There are no leaderboards or sharing yet.

## UI bar (non-negotiable)

- Use tokens (`bg-surface`, `text-ink-2`, `var(--cat-health)`), never raw hex in components.
- Category colours are for marks and accents, never body text. Numbers use `tabular-nums`.
- Concentric radius (outer = inner + padding), shadows for depth, borders only for dividers.
- Buttons press to `scale(0.96)`; frequent interactions ≤150ms on opacity/colour only; easing
  `cubic-bezier(0.2, 0, 0, 1)`; name transition properties, never `transition: all`.
- Icon swaps: scale 0.25→1, opacity 0→1, blur 4px→0. Lucide icons, stroke 1.5 next to regular
  text and 2 next to semibold.
- Every state change has a static cue besides motion. Hit areas ≥40px, visible focus,
  reduced motion respected.
- Check new components in `/dev/ui` in light and dark mode, and screenshot changed pages. Use mock
  mode (`npm run dev:mock`) to see pages with data.

## Git and commits

- Never commit: `.env` or any real key, `data/` (holds the key that encrypts saved connector keys),
  database dumps, real bank messages or account numbers (fixtures use fake numbers), screenshots of
  real data, `.next/`, `node_modules/`, or editor and OS files.
- Files named like `routes 2.ts` or `BUILD_ID 3` are iCloud sync duplicates. Delete them; never commit them.
- Git hooks in `.githooks/` enforce this. `npm install` turns them on (`core.hooksPath`).
  - **pre-commit:** blocks secret-looking strings, `.env`, `data/`, keys and dumps, iCloud
    duplicates, and files over 2 MB.
  - **pre-push:** runs `npm run typecheck` and `npm test`.
  - Don't bypass them with `--no-verify`; fix the cause.
- Commit only files related to the change. Review `git status` and `git diff --cached` before
  committing; never use `git add -A` blindly.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`),
  imperative mood, subject ≤72 characters, body explains why.
- `AGENTS.md` changes made by `next dev` belong in the commit (see the block at the top).
- Before pushing: `npm run typecheck`, `npm test`, and for UI changes a look in light and dark mode.

## Commands

- `npm run dev`: http://127.0.0.1:3030 plus the worker. Port 3000 is often taken by other projects,
  and two dev servers on one port make pages reload endlessly.
- `npm run dev:mock`: random data in `relife_mock`, on port 3001. Stop `npm run dev` first; they
  share the build folder.
- `npm test` · `npm run typecheck` · `npm run build` · `npm run db:push`
- `npm run service -- install|restart|stop|logs`: the production app as a LaunchAgent (starts at login). Stop it
  before `npm run dev`; they share port 3030.
