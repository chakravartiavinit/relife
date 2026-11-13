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

- Pages: Today (`/`: header, Check first, Life pulse, then the day's plan and a rail of Quests, Goals and Money), Life (`/life`, the hub: a brief and one tile per area plus Time,
  then "This week, area by area"), seven areas, Plan (`/plan`, tabs:
  Goals (up to 3 outcome goals with a baseline, linked actions and weekly review decisions), `/plan/routines`,
  `/plan/trackers`, `/plan/review`; details at `/plan/goals/[id]` and `/plan/trackers/[slug]`), Coach (`/coach`: Needs you and
  Ask side by side, `/coach/patterns`, `/coach/history`; `?filter=decisions|data`, `?ask=`, `?view=ask`) and You (`/you`, tabs: Progress (the character
  sheet: level, streak, week, consistency, achievements, XP), `/you/connections`, `/you/notifications`, `/you/settings`).
  Old URLs (`/goals`, `/habits`, `/insights`, `/inbox`, `/profile`, `/connectors`, `/settings`, `/activity`,
  `/relationships`, ...) redirect (307) through `LEGACY_REDIRECTS` in `src/domain/routes.ts`; never link to them.
  Navigation data (`NAV`, `isActive`) lives in `src/ui/components/nav.tsx`; the shell is in `src/ui/components/shell/`: a
  collapsible desktop `Sidebar` (240px, or a 72px icon rail; the choice is stored in `localStorage` `relife:sidebar`
  and put on `<html data-sidebar>` before paint by `sidebar-script.ts`, ⌘\ toggles it), the desktop `TopBar`
  (breadcrumb from `trail()`, Capture field, sync dot, Coach bell, level avatar), the phone `PhoneTopBar` and
  `TabBar` (a raised `+`; both open Capture). Everything the shell shows besides the page
  (Coach count, sync dot, level ring, area dots) comes from `loadShellStatus` in `src/core/shell.ts`: one SQL
  statement plus `xpLevel` and `buildDayPlan`, wrapped in React `cache`, read by each piece in its own Suspense
  island (`shell-status.tsx`). The needs-you rules (merchant grouping, nudges expire after 3 days) are in
  `src/domain/needs-you.ts`. The game look comes from three banners: `CharacterBanner`
  (`hud.tsx`, Progress on You only; Today has the lighter `TodayHeader`), `AreaHeader` (`area/area-header.tsx`, every area page) and `PageHeader` (everything else). Routine
  pictures come from `src/ui/routine-icons.ts`.
- Areas: the `AREAS` registry (`src/core/areas/index.ts`, one file per area next to it) is the one list of Health, Mind,
  Skills, Wealth, Hobbies, People (`/people`, DB category `relationships`) and Time: title, colour, tabs, pinned metrics,
  connector ids and the four headline numbers (`kpis`, shared by the area header, the Life tiles, the brief's facts and Today).
  Health, Mind, Skills, Hobbies and People share the `src/app/[area]/` template (`layout.tsx` → `AreaLayout`: `AreaHeader` →
  `AreaTabs` (Overview · Trends · Routines · Sources; counts stream in) → `AreaKpis` → the tab body; an unknown slug is a
  `notFound()`, because Cache Components does not allow `dynamicParams = false`). Each area's own Overview cards live in
  `src/ui/areas/` (`OVERVIEWS`) inside `OverviewShell`; Trends, Routines and Sources are the shared `area-*.tsx` in
  `src/ui/components/area/`. `AllMetrics` draws a `MetricTile` for every tracker of the area from every source (nothing is
  filtered by slug, so connector metrics like HRV or readiness show up on their own); `summarizeTracker` in
  `src/domain/metric-tile.ts` is the tested maths. Wealth (`src/app/wealth/`: Overview · Spending · Portfolio ·
  Subscriptions · Sources) and Time (`src/app/time/`) have their own folders on the same `AreaLayout` (Wealth with
  `kpis={false}`: each tab keeps its numbers). Every KPI item, tile and "Why?" opens a Peek: a metric where the number has
  one, else `brief:<scope>` (`KpiStrip` items take `peek`, `peekAll` sets one for a whole strip).
- Briefs: one line per scope (`today`, each category, `time`) in the `briefs` table, written by the `ai:area-briefs` job
  (`src/ai/jobs/area-briefs.ts`, daily 06:30 and on `data.changed`). The rules in `src/domain/briefs.ts` (pure, tested) write
  every line from `gatherBriefFacts` (`src/core/briefs.ts`); a hash of the facts plus a 2-hour throttle decide when to rewrite,
  and an AI reword (one `generate('parse', 'briefs.area')` call, lines over 110 characters rejected) is optional: with no
  model the rule line stays. `latestBrief` is the reader (null before `db:push` or any data, the UI then shows the static
  description), and the brief Peek shows the facts the line came from and whether rules or a model wrote it.
- Capture (`src/ui/components/capture/`, mounted once in `layout.tsx`): ⌘K, the top-bar field (it also opens on the first key typed into it and carries that key over), the tab-bar `+` and the `relife:command` event (`openCapture()` in `capture-data.ts`)
  all open it: a centred palette on a laptop, the `Sheet` at its half detent on a phone with the input at the bottom. Empty it
  shows Due now (check-off), Quick log chips (water +250, usual manual logs), mood faces (until logged today), Spent and Go to; typed it
  previews the quick-log grammar (`src/domain/quicklog.ts`), then Open and "Ask your coach" (⌘↵, `/coach?ask=`). Suggestions come from
  `GET /api/capture` (`loadCapture` in `src/core/capture.ts`: `buildDayPlan` + `manualLogHistory` + the pure `rankCaptureSuggestions`
  in `src/domain/capture.ts`) and are prefetched on hover/focus. Every result toasts with Undo: `quickLog` returns an undo token that
  `undoQuickLog` validates and reverses; check-offs undo with `toggleCheck(…, null)`, goal steps with `addToGoal(id, -step)`.
  `CaptureView` is presentational (`/dev/ui` draws it from fixtures); `capture.tsx` owns the actions.
- Peek: any number or row can open a detail panel (`?peek=type:id`; types in `src/domain/peek.ts`: metric, routine, goal,
  txn, merchant, insight, connector, person, quest, sync, brief). `PeekHost` (`peek/peek-host.tsx`, mounted in the layout
  under Suspense) reads the param, fetches `GET /api/peek?ref=` (loaders in `src/core/peek/`, one file per type, payload
  types in `src/core/peek/types.ts`, plain JSON) and draws `PeekView` in the `Sheet`: a non-modal panel on a laptop, so
  clicking another number swaps it, and a modal sheet on a phone. Opening pushes one history entry and swapping replaces
  it, so Back and Esc close it. Views are presentational (`views/*.tsx`; `/dev/ui` "Peek views" draws each from
  `src/ui/fixtures/peek.ts`). A shared component that changes data under an open peek calls `usePeekChanged()` after
  its action so the peek refetches. `MetricDetail` is shared with `/plan/trackers/[slug]`; `setTrackerTarget` sets a
  tracker's target. Add a `peek` to a `Kpi` to make a tile open one; the sync dot opens `sync:status`. To add a type:
  a loader, a payload type, a view, a `peekHeading` case, a fixture.
- Coach (`src/app/coach/`, `src/ui/components/coach/`): `/coach` is `CoachPanes` (Needs you | Ask on a laptop; a segmented
  control on a phone, mirrored to `?view=ask` with `replaceState`; `?ask=` from Capture's ⌘↵ forces Ask). **Needs you** is one
  typed queue (`NeedsYouItem` in `src/domain/needs-you.ts`, loaded and ranked by `loadNeedsYou` in `src/core/needs-you.ts`):
  recovery, alerts, the weekly review, goal drafts, proposals, nudges, messages ReLife could not read and payments to
  sort (one item per merchant). `NeedsYouPanel` draws the chips (All · Decisions · Data, `?filter=`), `NeedsYouList` the
  rows (`needs-you-row.tsx`, one `QueueItem` shell per kind). An action collapses its row to "✓ what happened · Undo" at once
  and the list puts it back with an error toast if the server action throws; Undo exists for dismiss (`restoreInsight`,
  only within `RESTORE_MINUTES` = 10) and for a category (`undoRecategorize`). Nothing is added without a tap. The shell badge
  (`loadShellStatus`) and the list share `pendingInsight()`, `UNREAD_FILTER` and `NUDGE_TTL_DAYS` (a nudge leaves the queue
  and the badge after 3 days and stays in History); `needs-you.integration.test.ts` checks the two agree. **Ask** is one
  conversation shared by the app and Telegram in `coach_messages` (`src/core/coach-messages.ts`; kept 180 days, the
  `coach-messages-prune` job deletes older rows; "Clear conversation" deletes all). `askData(q, { channel })` saves the
  question and the answer with `payload.sources` (Peek chips built from the tool calls, `sourcesFromSteps` in
  `src/domain/coach-thread.ts`) and `payload.insightIds` (routines `propose_schedule` made, shown inline with Approve and
  Dismiss), and passes the last 6 messages (2,000 characters) to the model so follow-ups work. `AskThread` draws it with beUI
  `message`, `message-scroller` and `prompt-input`; without a model the composer is off, the Connect card shows and saved
  history stays readable. History (`/coach/history`) has decisions, active plans and the Waiting / Skipped messages; Patterns
  is `PatternsCard` with "Ask why" (`/coach?ask=`). Writes fail soft: a missing `coach_messages` table (before `npm run
  db:push`) never loses the answer.
- Telegram: `/ask` and plain text write to the same thread (`channel: 'telegram'`); `/help` and `/status` end with "N things
  need you in ReLife → Coach" (`needsYouLine` in `src/bot/messages.ts`, the badge's count). Buttons that open the app
  (`openInReLife` in `src/bot/ui.ts`) exist only when the optional `RELIFE_PUBLIC_URL` is set (read with `env()`); without it
  messages stay text-only.
- Today (`src/app/page.tsx`, parts in `src/ui/components/today/`): each section is its own Suspense island with a skeleton of its final
  size, sharing cached loaders (`loadDayPlan`, `loadShellStatus`, `loadTodayBriefing`, `loadPulse`). `TodayHeader` (greeting, the
  `today` brief or the rule-based `planLine` with Why?, streak chip), `AttentionStrip` ("Check first": up to 3 time-sensitive items from
  `loadBriefing().attention`, nudges left out because Coach's count, `loadShellStatus().needsYou.total`, is one chip), `PulseRow` (the
  areas and Time, each the first headline number of its `AreaDef.kpis`; `core/pulse.ts`), then `Plan` (the all-day `Goals compact` rows and
  `Agenda timeline`) beside the rail (`Quests`, `GoalsCard`, `MoneyToday`). The rules are pure in `src/domain/day-plan.ts` (periods, Now line,
  greeting, goal pace, state). Every check-off and goal step toasts with Undo (`toggleCheck(…, null)`, `addToGoal(id, -step)`); rows,
  numbers and quests open Peeks. States: first day (nothing earned and setup open: `SetupCard` replaces Check first, Life pulse and Money,
  `GoalsCard` shows its empty line), nothing planned (EmptyState with Add a routine and Capture) and all done (`DayComplete` with its
  chest, `TomorrowCard`, the briefing becomes the recap). `/dev/ui` "Today" draws all of them from `src/ui/fixtures/today.ts`.
- Plan (`src/app/plan/(tabs)/`, parts in `src/ui/components/goals/` and `habits/`): **Goals** (`OutcomeGoalCard`: the title and the Now number open the goal Peek; a status badge from `goalPace` (Ahead, On pace, Behind pace) with an ink pace tick on the capsule; a "N slots free" well; the rail holds the weekly review card, the coach draft and Paused and finished). **New goal** is two steps in one dialog (`CreateSteps` in `goal-form.tsx`): pick a coach draft, a tracker with at least 7 recorded days (baseline prefilled from its 28-day average) or a check-in, then the form; open state stays URL-derived (`/plan?new=1`), and the toast reads "Goal started · First review Sun 15 Nov". **Routines** (`PlanRoutines`) opens with today's check-off from `loadDayPlan` (`Goals compact` for water, then `Agenda timeline`; Undo toasts like Today), then the routine list, each name a `PeekLink routine:<id>`; the tab label carries today's `done/total`. **Trackers** (`TrackersGrid`) is a `MetricTile` grid by area from `summarizeTracker`, with quiet and no-data trackers folded. **Review** (`ReviewFlow` in `review-flow.tsx`): a step list (Deciding, Up next, what was decided), one `GoalReviewCard` at a time with a four-card radiogroup, a "What changes" preview and Save (Finish asks twice). "Decide later" only moves on. With nothing due, `ReviewNow` starts one through `reviewGoalNowAction`.
- You (`src/app/you/`): Progress keeps `CharacterBanner` as the hero (the one page where the game layer is the frame); on a phone Achievements come before Consistency, and "How XP works" is folded. **Connections** starts with `YourSources` (`connections-status.tsx`: failing sources pinned as `FixRow` with the fix as the primary button, then a table with health, last sync, items synced and a sync icon; the rules `needsFix` and `isInline` are pure, in `src/domain/connections.ts`), then `SuggestedForYou` (unconnected sources for `profile.areas`; a username-only source carries its own field, checked on submit by the connector's `check`), then the searchable catalogue. A new key connection ends on `ConnectSuccess` (where the numbers will show up); a rejected key keeps the field and shows the connector's message with "Check again". `?oauth=<id>` on `/you/connections` still toasts the sign-in result. **Notifications** adds `NotificationChannel` (Telegram state, the 7-day sent / held / dropped counts from `weeklyNotifications`, and "Send a test message": `sendTestMessage` goes through `notify(user, 'events', …)`, so the user's own delivery choice, quiet hours and cap apply and the result says when they hold it back). **Settings** gained Areas (`saveAreas`) and the worker heartbeat.
- Look ("ReLife capsule"): ink black, white and the logo's capsule blue, light-first. The signature shapes are
  `CapsuleIcon` (`capsule-icon.tsx`, the tilted pill from the logo, for areas and avatars), `SystemLabel` (mono
  area label in `card.tsx`) and the `.halftone` dot texture in header corners. No other decorative textures.
- Type: the scale lives in `globals.css` (`text-display`, `text-title`, `text-heading`, `text-body`, `text-small`,
  `text-caption`, `text-label font-mono uppercase`; big numbers use `num`). New code uses these, not `text-[13px]`;
  `src/ui/type-scale.test.ts` counts the old arbitrary sizes and fails if the number goes up (lower it when you convert some).
- Shared primitives: `Sheet` (`sheet.tsx`: bottom sheet on a phone, non-modal 440px right panel on a laptop, starting at
  `--sheet-top`), `SegmentTabs` (`segment-tabs.tsx`: route-driven pill tabs), `PeekLink`/`openPeek`
  (`peek/peek-link.tsx`: open `?peek=type:id` without a server trip; `src/domain/peek.ts` parses it). Route map and
  old-URL redirects: `src/domain/routes.ts`. Each has a section in `/dev/ui`.
- Motion: CSS easing tokens in `globals.css` (`--ease-out-quint`, `--ease-out-strong`, `--ease-in-out-strong`);
  JS twins in `src/ui/beui/lib/ease.ts` (`EASE_OUT`, `EASE_OUT_STRONG`). Never retype the curves. Audits and
  plans live in `plans/`.
- `src/app/`: Next.js 16 App Router pages and `actions.ts` (all server actions). Cache Components is
  on: DB reads go in an async child component that calls `await connection()`, wrapped in
  `<Suspense>` with a skeleton sized like the content. See `src/app/page.tsx`.
- `src/core/`: ingest pipeline, schedules, metrics, quick-log writes, FX, time zones, connector keys, today's plan (`day-plan.ts`), shell status (`shell.ts`).
- `src/domain/`: pure TypeScript (recurrence, streaks, FIFO P&L, money formatting, the quick-log grammar, `?peek=`
  parsing, the route map). No DB, no React.
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
  to `@/ui/beui`). Change it only to fit ReLife tokens. `npx shadcn@latest add @beui/<name> -o` overwrites
  `lib/ease.ts` with beUI's own curves: restore it (`git checkout src/ui/beui/lib/ease.ts`) after installing.
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
  from `src/ai` and log through `src/ai/run.ts`. Write the rule-based answer first and let the model only reword it
  (`ai:area-briefs` is the pattern). A new table needs `npm run db:push` for the main and the mock database before restarting.
- **New area or area tab:** add it to `AREAS` (and `ROUTES` in `src/domain/routes.ts` if it has a new URL), give it `kpis`,
  `pinned` and `connectors`; the template, the Life tile and the brief pick it up. Add its Overview cards to `src/ui/areas/`.
- **Outcome goals:** rules in `src/domain/goals.ts` (tested), wiring in `src/core/goals.ts`, UI in `src/ui/components/goals/`.
  Separate from `plans`. Every write locks the user row and checks `version`; the AI only drafts and proposes (see docs/AI_COACH.md).
- **Odd fields:** put them in the `meta` JSON column; promote to a real column only when queried.

## Data rules

- Per-day values are keyed by the user's local date (`core/time.localDate`), never UTC dates.
- Money is stored in its original currency; convert at read time with `core/fx.convert`.
- Re-running any sync or parse must be safe: dedupe on `(source, externalId)` / `externalRef`.
- Nothing syncs until the user connects it on /you/connections. Keys typed there are stored encrypted in
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
