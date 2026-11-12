# ReLife: rules for working in this repo

This file is the source of repo-wide rules for people and coding agents (Claude Code reads it through
`CLAUDE.md`). `apps/web/AGENTS.md` holds the web app's own notes and the block `next dev` manages; it is
re-created there, not here. **Before writing Next.js code, read `apps/web/AGENTS.md`:** this Next.js differs from
older versions; its docs are in `node_modules/next/dist/docs/`.

Design and decisions: `docs/SYSTEM_DESIGN.md`. Read it before structural changes.

## Repo map

npm workspaces (no Turborepo). Run everything from the repo root; root scripts delegate to the workspaces.

- `apps/web/`: the Next.js dashboard and the worker (one package). Everything under "Layout" below lives here.
  It always runs with `apps/web` as its working directory.
- `apps/extension/`, `apps/mac/`, `apps/site/`: the Chrome extension, the native Mac app and the landing page, as
  they arrive (see `docs/SYSTEM_DESIGN.md` §14 for what exists today).
- `packages/tokens/` (design tokens, one source for CSS and Swift), `packages/contract/` (zod schemas and JSON
  fixtures for the device API), `packages/brand/` (name, tagline, logo and icon build).
- `.env` and `data/` stay at the repo root: they are the runtime state of the self-hosted server. `data/` holds the
  key that encrypts saved connector keys; `RELIFE_DATA_DIR` moves it. `.env` is read by `next.config.ts` and
  `drizzle.config.ts` through `@next/env` and by the worker and test scripts through `tsx --env-file=../../.env`;
  restart after editing it.
- `.githooks/`, `docs/`, `plans/`, `.claude/skills/`, `docker-compose.yml` stay at the root.

## Layout

- Pages: Today (`/`, the quest log: things to do now), Goals (`/goals`, up to 3 outcome goals with a baseline, linked actions and weekly review decisions; `/goals/[id]` and `/goals/review`), Activity (`/activity`, laptop time from `apps/extension/` and
  the Mac watcher), Progress (`/profile`, the character sheet: level, streak,
  week, consistency, achievements, XP; `/overview` redirects here), Habits, Insights, and six areas (Health, Mind, Skills, Wealth,
  Hobbies, People) that share one template (`AreaHeader` → `KpiStrip` → cards). Inbox, Connectors and Settings sit in the sidebar footer.
  Navigation lives in `apps/web/src/ui/components/nav.tsx`. The game look comes from three banners: `CharacterBanner`
  (`hud.tsx`, Today and Progress), `AreaHeader` (area pages) and `PageHeader` (everything else). Routine
  pictures come from `apps/web/src/ui/routine-icons.ts`.
- Look ("ReLife capsule"): ink black, white and the logo's capsule blue, light-first. The signature shapes are
  `CapsuleIcon` (`capsule-icon.tsx`, the tilted pill from the logo, for areas and avatars), `SystemLabel` (mono
  area label in `card.tsx`) and the `.halftone` dot texture in header corners. No other decorative textures.
- Tokens: colors, shadows, radii and easing live in `packages/tokens/tokens.json`; `npm run tokens` regenerates
  `packages/tokens/tokens.css`/`theme.css`, `apps/extension/tokens.css` and the Mac app's `Tokens.swift` (pre-push runs
  `npm run tokens -- --check`). Derived values and the Tailwind color mapping stay in `apps/web/src/app/globals.css`.
- Motion: CSS easing tokens (`--ease-out-quint`, `--ease-out-strong`, `--ease-in-out-strong`, from `tokens.json`);
  JS twins in `apps/web/src/ui/beui/lib/ease.ts` (`EASE_OUT`, `EASE_OUT_STRONG`, read from the package). Never retype the curves. Audits and
  plans live in `plans/`.
- `apps/web/src/app/`: Next.js 16 App Router pages and `actions.ts` (all server actions). Cache Components is
  on: DB reads go in an async child component that calls `await connection()`, wrapped in
  `<Suspense>` with a skeleton sized like the content. See `apps/web/src/app/(app)/page.tsx`.
- `apps/web/src/core/`: ingest pipeline, schedules, metrics, quick-log grammar, FX, time zones, connector keys.
- `apps/web/src/domain/`: pure TypeScript (recurrence, streaks, FIFO P&L, money formatting). No DB, no React.
- `apps/web/src/connectors/`, `apps/web/src/parsers/`, `apps/web/src/rules/`, `apps/web/src/ai/jobs/`: the four extension points.
- `apps/web/src/worker/`: long-running process (bot, laptop activity, job scheduler). `apps/web/src/jobs/`: every scheduled job.
  `apps/web/src/bot/`: Telegram.
- `apps/web/src/ui/`: tokens and components. `apps/web/src/app/globals.css` holds the design tokens.
- Brand: `packages/brand` is the one place for the product name, short name, tagline and logo source
  (`brand.json`, `logo/`). Read the name from `@relife/brand/brand.json`; don't retype it (`npm run brand:check` ratchets
  hard-coded names down to zero, so a rename is one change). `publicReady` stays `false` while the fan-tribute name and
  logo are in use; the public site must not deploy until it is `true`. Internal identifiers (`relife:*`, database names,
  storage keys) never change with the brand.
- Logo: the original ReLIFE logo. `packages/brand/logo/relife-logo.png` is the source;
  `npm run brand` rebuilds `apps/web/public/brand/` (light and dark logos and
  icons, with content-hashed names), `apps/web/src/ui/brand-files.ts` (their paths), `apps/web/src/app/icon.png` /
  `apple-icon.png` and the extension's toolbar icons (`apps/extension/icons/`, the capsule alone on transparent; the
  README header uses the 128 px one). Use `Wordmark` (or `CapsuleMark` for the icon) from `apps/web/src/ui/components/logo.tsx`;
  never redraw the logo.
- Name: the app is ReLife (it was briefly called Savepoint). Internal identifiers use `relife` too (database
  names, `relife:*` events and storage keys, the iCloud inbox path).
- Browser extension: `apps/extension/` (MV3, plain scripts, no build step, typed with JSDoc and `checkJs`; its own
  `AGENTS.md` has the rules). It talks to `/api/activity` (time) and `/api/companion` (the popup's Today tab:
  character, quests, routine checks, goal adds, quick log), both behind the Laptop activity token
  (`apps/web/src/core/companion.ts`); the request and response shapes are in `packages/contract`.
- Vendored UI code: `apps/web/src/ui/beui/` (beui.dev, installed from the `@beui` registry with imports rewritten
  to `@/ui/beui`). Change it only to fit ReLife tokens.
- Charts: [EvilCharts](https://evilcharts.com/docs), installed unmodified with `npx shadcn@latest add @evilcharts/recharts-<chart>`
  into `apps/web/src/components/evilcharts/`. Never edit those files (re-run the add command to update them); adapt in the
  wrappers instead. Pages use the wrappers in `apps/web/src/ui/components/charts.tsx`, one per kind of number: `TrendArea` (a measure
  over time), `DailyBars` (a count per day), `RankedBars` (a ranking), `ShareDonut` (shares of a whole),
  `Sparkline` (stat tiles), plus `StackedBars`. Habit adherence keeps its shape-coded strip.

## Adding things

- **New metric or routine:** no code. Use the UI, ⌘K (`coffee 2`) or Telegram. Trackers are created
  on first use.
- **New data source:** one file in `apps/web/src/connectors/<id>.ts` implementing `Connector`
  (`apps/web/src/core/types.ts`), added to the array in `apps/web/src/connectors/index.ts`. Declare `fields` (the
  Connect dialog inputs) and required `env` keys, emit raw events with stable `externalId`s, store
  progress with `ctx.setCursor`, and add a `check(get)` that tests the key or username before it's saved. Give it a `description` and `provides` chips, add its id to a category in
  `GROUPS` (`apps/web/src/ui/components/connector-market.tsx`; unlisted ones fall back to their life area), and
  optionally a logo in `apps/web/public/connectors/` mapped in `apps/web/src/ui/components/app-logo.tsx`. Document it in
  `docs/CONNECTORS.md` and `.env.example`.
- **New parser** (turns a connector's raw events into records): one file in `apps/web/src/parsers/` added to
  `apps/web/src/parsers/index.ts`, plus a fixture in `apps/web/src/parsers/fixtures/` (`{ event, expected }`). `npm test` runs
  every fixture. Bank SMS and bank emails are not read: spending comes only from the connected order apps.
- **New alert:** one file in `apps/web/src/rules/` added to `apps/web/src/rules/index.ts` (add `on: ['data.changed']` to also run it when new data lands). Give the `Alert` an `emoji` that says the topic, a `meta`
  line ("Wealth · Today"), one `action` and the exact numbers in `data` (shown in the app and on "Why?", not in the message); `alertText` in `apps/web/src/rules/run.ts` lays them out as a short, phone-notification-style message.
- **New Telegram message:** send it with `notify(user, category, …)` from `apps/web/src/core/outbox.ts`, never `sendMessage`
  directly (only direct replies in `apps/web/src/bot/telegram.ts` skip the outbox). The category (`reminders`, `alerts`,
  `analysis`, `coach`, `events`; rules in `apps/web/src/domain/notify.ts`) decides quiet hours, daily caps and repeats until a
  button is tapped, as chosen in Settings → Notifications. Give messages with buttons a `ref` (`reminder:<id>`,
  `insight:<id>`) so repeats stop once it's handled in the app. Build text with the helpers in `apps/web/src/bot/ui.ts`.
- **New achievement:** append to `apps/web/src/achievements/index.ts`. `check` reads the shared stats and returns
  progress, so locked ones show how close you are.
- **New scheduled or event-driven job:** one entry in `JOBS` in `apps/web/src/jobs/index.ts`: an `id`, a `schedule`
  (`{ cron }` in the user's time zone, or `{ everyMinutes }`) and `run()`. Add `on: ['some.event']` to also run it
  the moment `emit('some.event')` fires. The engine (`apps/web/src/core/jobs.ts`) keeps one run at a time across the worker
  and the web, remembers next runs across restarts, catches up missed cron runs and backs off after failures.
  New connectors get a `sync:<id>` job automatically and sync as soon as they're connected.
- **New AI job:** `apps/web/src/ai/jobs/<id>.ts`, added to `JOBS` in `apps/web/src/jobs/index.ts`. Use `model(task)`
  from `apps/web/src/ai` and log through `apps/web/src/ai/run.ts`.
- **Outcome goals:** rules in `apps/web/src/domain/goals.ts` (tested), wiring in `apps/web/src/core/goals.ts`, UI in `apps/web/src/ui/components/goals/`.
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

- XP rules are pure functions in `apps/web/src/domain/xp.ts` (tested); `apps/web/src/core/xp.ts` turns days into
  `xp_events` rows. Every row has a unique `ref`, so rescoring a day replaces it instead of adding.
- Two kinds of XP: **consistency** (up to 100 a day split across whatever was due, so adding routines
  never raises the ceiling) and **standard** (fixed measures that mean the same for everyone).
  Synced data earns full XP, typed-in data half and at most 40 a day. Streak multiplier up to ×1.5.
- Fair play: a routine pays from the day after it was created; only today and yesterday are rescored.
- **The System** (Solo Leveling style) issues the daily quests: `apps/web/src/core/system.ts` reads every signal from
  `apps/web/src/core/patterns.ts`, the AI (`plan` model) picks what to train from the stats the user wants to improve
  (Settings → The System, `profile.improve`) and what's slipping, and words it. `apps/web/src/domain/system.ts` (tested)
  keeps it fair: targets are clamped near the usual, ranks E–S come from how often past days met the target,
  quests you'd clear anyway are skipped, difficulty follows your clear rate, connector data clears quests, a
  recorded missed daily pauses new quests the next day and offers explicit recovery choices (smaller step, rest, priorities);
  late imports recheck yesterday all day, so a miss the data now meets clears and lifts the pause (never the reverse),
  and sharp bad changes can offer a modest corrective quest. Unknown measurements are not failures.
  It also reads spending habits from order items (impulse categories and items bought on many days, like a soft
  drink; `habitSignals` in `apps/web/src/domain/basket.ts`): at most one habit quest a day, only when that habit is above
  its usual, never the one cleared yesterday (`balanceHabits`). A sudden spike can still call an emergency quest. Without an
  AI model the rule-based fallback sets the quests. Quests live in `system_quests`; the worker runs it every
  5 minutes and warns at 21:00 (notification category `system`).
- Weekly quests, chests and streak freezes: rules in `apps/web/src/domain/quests.ts` (tested), wiring in `apps/web/src/core/quests.ts`.
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
  - **pre-commit:** blocks secret-looking strings (including device tokens, `rlf_<kind>_…`), `.env`, `data/`, keys and dumps, iCloud
    duplicates, and files over 2 MB.
  - **pre-push:** runs `npm run typecheck` and `npm test` (every workspace), `npm run tokens -- --check`,
    `npm run brand:check`, and on a Mac with `swift` installed, `swift test` when `apps/mac` or
    `packages/contract/fixtures` changed.
  - Don't bypass them with `--no-verify`; fix the cause.
- Commit only files related to the change. Review `git status` and `git diff --cached` before
  committing; never use `git add -A` blindly.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`),
  imperative mood, subject ≤72 characters, body explains why.
- `AGENTS.md` changes made by `next dev` belong in the commit (see the block at the top).
- Before pushing: `npm run typecheck`, `npm test`, and for UI changes a look in light and dark mode.

## Commands

All from the repo root (they delegate to `apps/web` with `-w apps/web`).

- `npm run dev`: http://127.0.0.1:3030 plus the worker. Port 3000 is often taken by other projects,
  and two dev servers on one port make pages reload endlessly.
- `npm run dev:mock`: random data in `relife_mock`, on port 3001. Stop `npm run dev` first; they
  share the build folder.
- `npm test` · `npm run typecheck`: run in every workspace that has them. `npm run build` · `npm run db:push`
- `npm run tokens` regenerates the token outputs (`-- --check` fails if they are stale); `npm run brand` rebuilds
  the logo files; `npm run brand:check`; `npm run contract:check` runs the contract fixtures test.
- `npm run service -- install|restart|stop|logs`: the production app as a LaunchAgent (starts at login). Stop it
  before `npm run dev`; they share port 3030. After the move into `apps/web`, run `install` once more so the
  LaunchAgent's working directory is `apps/web`.
- Scripts under `apps/web/scripts/` run from `apps/web`: `npx tsx --env-file=../../.env scripts/<file>.ts`.
- If the checkout is in iCloud Drive, pause sync while moving folders; delete any "file 2" duplicates it makes.
