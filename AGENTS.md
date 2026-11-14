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
- `apps/extension/`, `apps/mac/`, `apps/android/`, `apps/site/`: the Chrome extension, the native Mac app, the Android
  Health Connect app (Kotlin, Gradle, no package.json; see `apps/android/AGENTS.md`) and the landing page, as
  they arrive (see `docs/SYSTEM_DESIGN.md` §14 for what exists today).
- `packages/tokens/` (design tokens, one source for CSS, Swift and Kotlin), `packages/contract/` (zod schemas and JSON
  fixtures for the device API), `packages/brand/` (name, tagline, logo and icon build).
- `.env` and `data/` stay at the repo root: they are the runtime state of the self-hosted server. `data/` holds the
  key that encrypts saved connector keys; `RELIFE_DATA_DIR` moves it. `.env` is read by `next.config.ts` and
  `drizzle.config.ts` through `@next/env` and by the worker and test scripts through `tsx --env-file=../../.env`;
  restart after editing it.
- `.githooks/`, `docs/`, `plans/`, `.claude/skills/`, `docker-compose.yml`, `Dockerfile`, `docker/` (the image's entrypoint) and `install.sh` stay at the root.

## Layout

- Pages: Today (`/`: header, Check first, Life pulse, then the day's plan and a rail of Quests, Goals and Money), Life (`/life`, the hub: a brief and one tile per area plus Time,
  then "This week, area by area"), seven areas, Plan (`/plan`, tabs:
  Goals (up to 3 outcome goals with a baseline, linked actions and weekly review decisions), `/plan/routines`,
  `/plan/trackers`, `/plan/review`; details at `/plan/goals/[id]` and `/plan/trackers/[slug]`), Coach (`/coach`: Needs you and
  Ask side by side, `/coach/patterns`, `/coach/history`; `?filter=decisions|data`, `?ask=`, `?view=ask`) and You (`/you`, tabs: Progress (the character
  sheet: level, streak, week, consistency, achievements, XP), `/you/connections`, `/you/notifications`, `/you/settings`, `/you/settings/data` (Data & privacy: export, backups, what each source and AI call sends, delete everything; `apps/web/src/core/data/`), and `/you/settings/devices/phone` ("Use on your phone": which address a
  phone can reach, one pairing QR, install and notification steps).
  Old URLs (`/goals`, `/habits`, `/insights`, `/inbox`, `/profile`, `/connectors`, `/settings`, `/activity`,
  `/relationships`, ...) redirect (307) through `LEGACY_REDIRECTS` in `apps/web/src/domain/routes.ts`; never link to them.
  Navigation data (`NAV`, `isActive`) lives in `apps/web/src/ui/components/nav.tsx`; the shell is in `apps/web/src/ui/components/shell/`: a
  collapsible desktop `Sidebar` (240px, or a 72px icon rail; the choice is stored in `localStorage` `relife:sidebar`
  and put on `<html data-sidebar>` before paint by `sidebar-script.ts`, ⌘\ toggles it), the desktop `TopBar`
  (breadcrumb from `trail()`, Capture field, sync dot, Coach bell, level avatar), the phone `PhoneTopBar` and
  `TabBar` (a raised `+`; both open Capture). Everything the shell shows besides the page
  (Coach count, sync dot, level ring, area dots) comes from `loadShellStatus` in `apps/web/src/core/shell.ts`: one SQL
  statement plus `xpLevel` and `buildDayPlan`, wrapped in React `cache`, read by each piece in its own Suspense
  island (`shell-status.tsx`). The needs-you rules (merchant grouping, nudges expire after 3 days) are in
  `apps/web/src/domain/needs-you.ts`. The game look comes from three banners: `CharacterBanner`
  (`hud.tsx`, Progress on You only; Today has the lighter `TodayHeader`), `AreaHeader` (`area/area-header.tsx`, every area page) and `PageHeader` (everything else). Routine
  pictures come from `apps/web/src/ui/routine-icons.ts`.
- Areas: the `AREAS` registry (`apps/web/src/core/areas/index.ts`, one file per area next to it) is the one list of Health, Mind,
  Skills, Wealth, Hobbies, People (`/people`, DB category `relationships`) and Time: title, colour, tabs, pinned metrics,
  connector ids and the four headline numbers (`kpis`, shared by the area header, the Life tiles, the brief's facts and Today).
  Health, Mind, Skills, Hobbies and People share the `apps/web/src/app/(app)/[area]/` template (`layout.tsx` → `AreaLayout`: `AreaHeader` →
  `AreaTabs` (Overview · Trends · Routines · Sources; counts stream in) → `AreaKpis` → the tab body; an unknown slug is a
  `notFound()`, because Cache Components does not allow `dynamicParams = false`). Each area's own Overview cards live in
  `apps/web/src/ui/areas/` (`OVERVIEWS`) inside `OverviewShell`; Trends, Routines and Sources are the shared `area-*.tsx` in
  `apps/web/src/ui/components/area/`. `AllMetrics` draws a `MetricTile` for every tracker of the area from every source (nothing is
  filtered by slug, so connector metrics like HRV or readiness show up on their own); `summarizeTracker` in
  `apps/web/src/domain/metric-tile.ts` is the tested maths. Wealth (`apps/web/src/app/(app)/wealth/`: Overview · Spending · Portfolio ·
  Subscriptions · Sources) and Time (`apps/web/src/app/(app)/time/`) have their own folders on the same `AreaLayout` (Wealth with
  `kpis={false}`: each tab keeps its numbers). Every KPI item, tile and "Why?" opens a Peek: a metric where the number has
  one, else `brief:<scope>` (`KpiStrip` items take `peek`, `peekAll` sets one for a whole strip).
- Briefs: one line per scope (`today`, each category, `time`) in the `briefs` table, written by the `ai:area-briefs` job
  (`apps/web/src/ai/jobs/area-briefs.ts`, daily 06:30 and on `data.changed`). The rules in `apps/web/src/domain/briefs.ts` (pure, tested) write
  every line from `gatherBriefFacts` (`apps/web/src/core/briefs.ts`); a hash of the facts plus a 2-hour throttle decide when to rewrite,
  and an AI reword (one `generate('parse', 'briefs.area')` call, lines over 110 characters rejected) is optional: with no
  model the rule line stays. `latestBrief` is the reader (null before `db:push` or any data, the UI then shows the static
  description), and the brief Peek shows the facts the line came from and whether rules or a model wrote it.
- Capture (`apps/web/src/ui/components/capture/`, mounted once in `layout.tsx`): ⌘K, the top-bar field (it also opens on the first key typed into it and carries that key over), the tab-bar `+` and the `relife:command` event (`openCapture()` in `capture-data.ts`)
  all open it: a centred palette on a laptop, the `Sheet` at its half detent on a phone with the input at the bottom. Empty it
  shows Due now (check-off), Quick log chips (water +250, usual manual logs), mood faces (until logged today), Spent and Go to; typed it
  previews the quick-log grammar (`apps/web/src/domain/quicklog.ts`), then Open and "Ask your coach" (⌘↵, `/coach?ask=`). Suggestions come from
  `GET /api/capture` (`loadCapture` in `apps/web/src/core/capture.ts`: `buildDayPlan` + `manualLogHistory` + the pure `rankCaptureSuggestions`
  in `apps/web/src/domain/capture.ts`) and are prefetched on hover/focus. Every result toasts with Undo: `quickLog` returns an undo token that
  `undoQuickLog` validates and reverses; check-offs undo with `toggleCheck(…, null)`, goal steps with the `undoQuickLog` token `addToGoal` returns (the minus buttons use `undoGoalStep`).
  `CaptureView` is presentational (`/dev/ui` draws it from fixtures); `capture.tsx` owns the actions.
- Peek: any number or row can open a detail panel (`?peek=type:id`; types in `apps/web/src/domain/peek.ts`: metric, routine, goal,
  txn, merchant, insight, connector, person, quest, sync, brief). `PeekHost` (`peek/peek-host.tsx`, mounted in the layout
  under Suspense) reads the param, fetches `GET /api/peek?ref=` (loaders in `apps/web/src/core/peek/`, one file per type, payload
  types in `apps/web/src/core/peek/types.ts`, plain JSON) and draws `PeekView` in the `Sheet`: a non-modal panel on a laptop, so
  clicking another number swaps it, and a modal sheet on a phone. Opening pushes one history entry and swapping replaces
  it, so Back and Esc close it. Views are presentational (`views/*.tsx`; `/dev/ui` "Peek views" draws each from
  `apps/web/src/ui/fixtures/peek.ts`). A shared component that changes data under an open peek calls `usePeekChanged()` after
  its action so the peek refetches. `MetricDetail` is shared with `/plan/trackers/[slug]`; `setTrackerTarget` sets a
  tracker's target. Add a `peek` to a `Kpi` to make a tile open one; the sync dot opens `sync:status`. To add a type:
  a loader, a payload type, a view, a `peekHeading` case, a fixture.
- Coach (`apps/web/src/app/(app)/coach/`, `apps/web/src/ui/components/coach/`): `/coach` is `CoachPanes` (Needs you | Ask on a laptop; a segmented
  control on a phone, mirrored to `?view=ask` with `replaceState`; `?ask=` from Capture's ⌘↵ forces Ask). **Needs you** is one
  typed queue (`NeedsYouItem` in `apps/web/src/domain/needs-you.ts`, loaded and ranked by `loadNeedsYou` in `apps/web/src/core/needs-you.ts`):
  recovery, alerts, the weekly review, goal drafts, proposals, nudges, messages ReLife could not read and payments to
  sort (one item per merchant). `NeedsYouPanel` draws the chips (All · Decisions · Data, `?filter=`), `NeedsYouList` the
  rows (`needs-you-row.tsx`, one `QueueItem` shell per kind). An action collapses its row to "✓ what happened · Undo" at once
  and the list puts it back with an error toast if the server action throws; Undo exists for dismiss (`restoreInsight`,
  only within `RESTORE_MINUTES` = 10) and for a category (`undoRecategorize`). Nothing is added without a tap. The shell badge
  (`loadShellStatus`) and the list share `pendingInsight()`, `UNREAD_FILTER` and `NUDGE_TTL_DAYS` (a nudge leaves the queue
  and the badge after 3 days and stays in History); `needs-you.integration.test.ts` checks the two agree. **Ask** is one
  conversation shared by the app and Telegram in `coach_messages` (`apps/web/src/core/coach-messages.ts`; kept 180 days, the
  `coach-messages-prune` job deletes older rows; "Clear conversation" deletes all). `askData(q, { channel })` saves the
  question and the answer with `payload.sources` (Peek chips built from the tool calls, `sourcesFromSteps` in
  `apps/web/src/domain/coach-thread.ts`) and `payload.insightIds` (routines `propose_schedule` made, shown inline with Approve and
  Dismiss), and passes the last 6 messages (2,000 characters) to the model so follow-ups work. `AskThread` draws it with beUI
  `message`, `message-scroller` and `prompt-input`; without a model the composer is off, the Connect card shows and saved
  history stays readable. History (`/coach/history`) has decisions, active plans and the Waiting / Skipped messages; Patterns
  is `PatternsCard` with "Ask why" (`/coach?ask=`). Writes fail soft: a missing `coach_messages` table (before `npm run
  db:push`) never loses the answer.
- Telegram: `/ask` and plain text write to the same thread (`channel: 'telegram'`); `/help` and `/status` end with "N things
  need you in ReLife → Coach" (`needsYouLine` in `apps/web/src/bot/messages.ts`, the badge's count). Buttons that open the app
  (`openInReLife` in `apps/web/src/bot/ui.ts`) exist only when the optional `RELIFE_PUBLIC_URL` is set (read with `env()`); without it
  messages stay text-only.
- Today (`apps/web/src/app/(app)/page.tsx`, parts in `apps/web/src/ui/components/today/`): each section is its own Suspense island with a skeleton of its final
  size, sharing cached loaders (`loadDayPlan`, `loadShellStatus`, `loadTodayBriefing`, `loadPulse`). `TodayHeader` (greeting, the
  `today` brief or the rule-based `planLine` with Why?, streak chip), `AttentionStrip` ("Check first": up to 3 time-sensitive items from
  `loadBriefing().attention`, nudges left out because Coach's count, `loadShellStatus().needsYou.total`, is one chip), `PulseRow` (the
  areas and Time, each the first headline number of its `AreaDef.kpis`; `core/pulse.ts`), then `Plan` (the all-day `Goals compact` rows and
  `Agenda timeline`) beside the rail (`Quests`, `GoalsCard`, `MoneyToday`). The rules are pure in `apps/web/src/domain/day-plan.ts` (periods, Now line,
  greeting, goal pace, state). Every check-off and goal step toasts with Undo (`toggleCheck(…, null)`, `undoQuickLog` with the token `addToGoal` returns); rows,
  numbers and quests open Peeks. States: first day (nothing earned and setup open: `SetupCard` replaces Check first, Life pulse and Money,
  `GoalsCard` shows its empty line), nothing planned (EmptyState with Add a routine and Capture) and all done (`DayComplete` with its
  chest, `TomorrowCard`, the briefing becomes the recap). `/dev/ui` "Today" draws all of them from `apps/web/src/ui/fixtures/today.ts`.
- Plan (`apps/web/src/app/(app)/plan/(tabs)/`, parts in `apps/web/src/ui/components/goals/` and `habits/`): **Goals** (`OutcomeGoalCard`: the title and the Now number open the goal Peek; a status badge from `goalPace` (Ahead, On pace, Behind pace) with an ink pace tick on the capsule; a "N slots free" well; the rail holds the weekly review card, the coach draft and Paused and finished). **New goal** is two steps in one dialog (`CreateSteps` in `goal-form.tsx`): pick a coach draft, a tracker with at least 7 recorded days (baseline prefilled from its 28-day average) or a check-in, then the form; open state stays URL-derived (`/plan?new=1`), and the toast reads "Goal started · First review Sun 15 Nov". **Routines** (`PlanRoutines`) opens with today's check-off from `loadDayPlan` (`Goals compact` for water, then `Agenda timeline`; Undo toasts like Today), then the routine list, each name a `PeekLink routine:<id>`; the tab label carries today's `done/total`. **Trackers** (`TrackersGrid`) is a `MetricTile` grid by area from `summarizeTracker`, with quiet and no-data trackers folded. **Review** (`ReviewFlow` in `review-flow.tsx`): a step list (Deciding, Up next, what was decided), one `GoalReviewCard` at a time with a four-card radiogroup, a "What changes" preview and Save (Finish asks twice). "Decide later" only moves on. With nothing due, `ReviewNow` starts one through `reviewGoalNowAction`.
- You (`apps/web/src/app/(app)/you/`): Progress keeps `CharacterBanner` as the hero (the one page where the game layer is the frame); on a phone Achievements come before Consistency, and "How XP works" is folded. **Connections** starts with `YourSources` (`connections-status.tsx`: failing sources pinned as `FixRow` with the fix as the primary button, then a table with health, last sync, items synced and a sync icon; the rules `needsFix` and `isInline` are pure, in `apps/web/src/domain/connections.ts`), then `SuggestedForYou` (unconnected sources for `profile.areas`; a username-only source carries its own field, checked on submit by the connector's `check`), then the searchable catalogue. A new key connection ends on `ConnectSuccess` (where the numbers will show up); a rejected key keeps the field and shows the connector's message with "Check again". `?oauth=<id>` on `/you/connections` still toasts the sign-in result. **Notifications** adds `NotificationChannel` (Telegram state, the 7-day sent / held / dropped counts from `weeklyNotifications`, and "Send a test message": `sendTestMessage` goes through `notify(user, 'events', …)`, so the user's own delivery choice, quiet hours and cap apply and the result says when they hold it back). **Settings** gained Areas (`saveAreas`) and the worker heartbeat.
- Setup (`/welcome`, `apps/web/src/ui/components/onboarding-*.tsx`): four steps, You · Areas · Connect · Routines (`STEPS` in
  `onboarding-data.ts`), as a split screen: the questions on the left (`onboarding-flow.tsx` holds the state, the footer and
  the draft in `sessionStorage` `relife:setup-draft:v2`; the four steps are in `onboarding-steps.tsx`, their shared look in
  `onboarding-ui.tsx`) and the save file building itself on the right (`onboarding-preview.tsx`; one line on a phone).
  **You** is the name (beUI `input`) and a region card (time zone, currency, each with Change). **Areas** is the six area tiles
  and up to three "Improve first" picks. **Connect** offers up to six sources for the picked areas (`pickSources` in
  `apps/web/src/domain/onboarding.ts`, tested: a username first, then a key, then sign-in and browser-login ones as "Later", spread
  across areas, Telegram last): a username-only source connects in the row (`InlineUsernameConnect`, checked on submit), a
  key source opens the connect dialog (`ConnectorDialog`), and the rows stay put while a source connects. **Routines** has
  the usual wake and bed times, the sleep, steps and water targets (beUI `adaptive-stepper`) and the routines to start with:
  when an AI model is set `suggestOnboardingRoutines` builds them from what was said (a skeleton while it works, three ticked;
  on failure the starter list stands in), else the templates in `apps/web/src/core/onboarding.ts` with the suggested few ticked.
  Voice, goals and constraints are not asked: `tone` keeps its saved value (Balanced on a first run, the coach notes in
  Settings carry the voice). "Start Level 1" calls `finishOnboarding` and lands on `/`, where the first-day `SetupCard` carries
  what is left (it counts any connected data source, so the Connect step feeds it). "Skip for now" saves a name and region if
  they are filled, then does the same. Today redirects here until `profile.onboardedAt` is set; "Run setup again" (Settings)
  sends only what was changed. `/dev/ui` "Setup" draws every step and the preview from fixtures.
- Look ("ReLife capsule"): ink black, white and the logo's capsule blue, light-first. The signature shapes are
  `CapsuleIcon` (`capsule-icon.tsx`, the tilted pill from the logo, for areas and avatars), `SystemLabel` (mono
  area label in `card.tsx`) and the `.halftone` dot texture in header corners. No other decorative textures.
- Type: the scale lives in `globals.css` (`text-display`, `text-title`, `text-heading`, `text-body`, `text-small`,
  `text-caption`, `text-label font-mono uppercase`; big numbers use `num`). New code uses these, not `text-[13px]`;
  `apps/web/src/ui/type-scale.test.ts` counts the old arbitrary sizes and fails if the number goes up (lower it when you convert some).
- Shared primitives: `Sheet` (`sheet.tsx`: bottom sheet on a phone, non-modal 440px right panel on a laptop, starting at
  `--sheet-top`), `SegmentTabs` (`segment-tabs.tsx`: route-driven pill tabs), `PeekLink`/`openPeek`
  (`peek/peek-link.tsx`: open `?peek=type:id` without a server trip; `apps/web/src/domain/peek.ts` parses it). Route map and
  old-URL redirects: `apps/web/src/domain/routes.ts`. Each has a section in `/dev/ui`.
- Tokens: colors, shadows, radii and easing live in `packages/tokens/tokens.json`; `npm run tokens` regenerates
  `packages/tokens/tokens.css`/`theme.css`, `apps/extension/tokens.css`, the Mac app's `Tokens.swift` and the Android app's `Tokens.kt` (pre-push runs
  `npm run tokens -- --check`). Derived values and the Tailwind color mapping stay in `apps/web/src/app/globals.css`.
- Motion: CSS easing tokens (`--ease-out-quint`, `--ease-out-strong`, `--ease-in-out-strong`, from `tokens.json`);
  JS twins in `apps/web/src/ui/beui/lib/ease.ts` (`EASE_OUT`, `EASE_OUT_STRONG`, read from the package). Never retype the curves. Audits and
  plans live in `plans/`. Scoped features waiting to be built are parked in `docs/FEATURES.md`.
- `apps/web/src/app/`: Next.js 16 App Router pages and `actions.ts` (all server actions). Cache Components is
  on: DB reads go in an async child component that calls `await connection()`, wrapped in
  `<Suspense>` with a skeleton sized like the content. See `apps/web/src/app/(app)/page.tsx`.
- `apps/web/src/core/`: ingest pipeline, schedules, metrics, quick-log writes, FX, time zones, connector keys, today's plan (`day-plan.ts`), shell status (`shell.ts`).
- `apps/web/src/domain/`: pure TypeScript (recurrence, streaks, FIFO P&L, money formatting, the quick-log grammar, `?peek=`
  parsing, the route map). No DB, no React.
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
  to `@/ui/beui`). Change it only to fit ReLife tokens. `npx shadcn@latest add @beui/<name> -o` overwrites
  `lib/ease.ts` with beUI's own curves: restore it (`git checkout apps/web/src/ui/beui/lib/ease.ts`) after installing.
- Charts: [EvilCharts](https://evilcharts.com/docs), installed unmodified with `npx shadcn@latest add @evilcharts/recharts-<chart>` (run it in `apps/web`, where `components.json` is)
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
  The same row is also sent as web push to every subscribed browser (`apps/web/src/core/push.ts`, `domain/push.ts` for the
  text, buttons and states; `public/sw.js` shows it and runs a button through `/api/v1/push/action`), as each category's
  "Send to" chips allow. A new button needs an entry in `parseAction` and `actionAllowed` (`domain/push.ts`), or it will
  not appear on push.
- **New device kind or scope:** `core/auth/trust.ts` (`scopesFor`, `narrowScopes`) and `core/auth/pairing.ts`. A route that
  must accept a narrow device (the Android app's `ingest`) uses `authenticate(req, scope)` with its own scope;
  `authenticateAny` is only for sign-out (`devices/me/revoke`); `me` stays at `companion`. `POST /api/v1/health` (`core/v1/health.ts`) turns Health Connect days
  into raw events `day:<date>` and then entries through `parsers/daily.ts` (source `health-connect`).
- **New achievement:** append to `apps/web/src/achievements/index.ts`. `check` reads the shared stats and returns
  progress, so locked ones show how close you are.
- **New scheduled or event-driven job:** one entry in `JOBS` in `apps/web/src/jobs/index.ts`: an `id`, a `schedule`
  (`{ cron }` in the user's time zone, or `{ everyMinutes }`) and `run()`. Add `on: ['some.event']` to also run it
  the moment `emit('some.event')` fires. The engine (`apps/web/src/core/jobs.ts`) keeps one run at a time across the worker
  and the web, remembers next runs across restarts, catches up missed cron runs and backs off after failures.
  New connectors get a `sync:<id>` job automatically and sync as soon as they're connected.
- **New AI job:** `apps/web/src/ai/jobs/<id>.ts`, added to `JOBS` in `apps/web/src/jobs/index.ts`. Use `model(task)`
  from `apps/web/src/ai` and log through `apps/web/src/ai/run.ts`. Write the rule-based answer first and let the model only reword it
  (`ai:area-briefs` is the pattern). A new table needs `npm run db:push` for the main and the mock database before restarting.
- **New area or area tab:** add it to `AREAS` (and `ROUTES` in `apps/web/src/domain/routes.ts` if it has a new URL), give it `kpis`,
  `pinned` and `connectors`; the template, the Life tile and the brief pick it up. Add its Overview cards to `apps/web/src/ui/areas/`.
- **Outcome goals:** rules in `apps/web/src/domain/goals.ts` (tested), wiring in `apps/web/src/core/goals.ts`, UI in `apps/web/src/ui/components/goals/`.
  Separate from `plans`. Every write locks the user row and checks `version`; the AI only drafts and proposes (see docs/AI_COACH.md).
- **New table:** classify it in `apps/web/src/core/data/tables.ts` (export, wipe, import order); the test fails until you do.
  A new `generate('<task>', '<label>')` call needs an entry in `apps/web/src/ai/uses.ts` the same way (the privacy page
  lists it). A new connector may set `reach: 'local' | 'lan' | 'public'` when its data never leaves this machine or
  network; without it the privacy page counts it as an online service.
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
- Every write is a POST, PUT, PATCH, DELETE or server action. Never write in a GET route or during a render (the demo
  gate and the demo's read-only database connection rely on it). A page that must save something on open (Wealth's
  net-worth snapshot) skips it with `isDemo()`.
- Schema change: edit `apps/web/src/db/schema.ts`, `npm run db:push` while iterating, then `npm run db:generate` and
  commit the new files in `apps/web/drizzle/` (pre-push fails when they are missing). Never edit a migration that has
  shipped. `apps/web/scripts/migrate.ts` (`npm run db:migrate`, the Docker `migrate` service) applies them and adopts a
  database made by `db:push`. The image has no drizzle-kit.
- `RELIFE_DEMO=1` is the strict read-only public demo (`apps/web/src/core/demo.ts`): it needs `RELIFE_MOCK=1`
  (`src/db/index.ts` refuses to start otherwise); the edge gate refuses every non-GET request and every server action
  with 403 "Demo: changes are off"; the database session is read-only; the worker, AI and connectors are off; visitors
  are one synthetic device, so there is no sign-in. New client code that calls a server action must handle the rejection
  (try/catch or `.catch` reaching `toast.error()`): in the demo `ToastProvider` turns that into the one demo toast.
  `RELIFE_CONTAINER=1` marks the Docker image (shopping connectors are skipped there, sign-in hints name
  `docker compose exec web relife signin`).
- Exports never include secrets: no `secrets_encrypted`, cursors, token hashes or saved keys (`core/data/tables.ts` drops them).
  A backup is exact and holds `data/secret.key`; it is encrypted when `RELIFE_BACKUP_PASSPHRASE` is set and is never offered as a download.

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
  `backups/` and export ZIPs, database dumps, real bank messages or account numbers (fixtures use fake numbers), screenshots of
  real data, `.next/`, `node_modules/`, or editor and OS files.
- Files named like `routes 2.ts` or `BUILD_ID 3` are iCloud sync duplicates. Delete them; never commit them.
- Git hooks in `.githooks/` enforce this. `npm install` turns them on (`core.hooksPath`).
  - **pre-commit:** blocks secret-looking strings (including device tokens, `rlf_<kind>_…`), `.env`, `data/`, keys and dumps, iCloud
    duplicates, and files over 2 MB.
  - **pre-push:** runs `npm run typecheck` and `npm test` (every workspace), `npm run tokens -- --check`,
    `npm run brand:check`, a migration check (`drizzle-kit generate` must produce nothing new), and on a Mac with `swift` installed, `swift test` when `apps/mac` or
    `packages/contract/fixtures` changed.
  - Don't bypass them with `--no-verify`; fix the cause.
- CI is meant to run the pre-commit rules over the whole PR diff, tokens, brand, typecheck, `npm test`, the PostgreSQL
  integration tests (`npm run test:integration -w apps/web` after `npm run mock:seed`), `next build` for web and site and
  the extension pack. Workflow files are added in their own commit (the Git token may lack the `workflow` scope);
  Dependabot (`.github/dependabot.yml`) sends weekly grouped updates.
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
- `npm test` · `npm run typecheck`: run in every workspace that has them. `npm run build` · `npm run db:push` · `npm run db:generate` · `npm run db:migrate`
- `npm run tokens` regenerates the token outputs (`-- --check` fails if they are stale); `npm run brand` rebuilds
  the logo files; `npm run brand:check`; `npm run contract:check` runs the contract fixtures test.
- `docker compose up -d` starts only Postgres on 5442 (development). `COMPOSE_PROFILES=app` runs the whole app from the
  image (docs/SELF_HOSTING.md), `--profile ai` adds Ollama, `--profile demo` the read-only demo on port 3001.
- `npm run service -- install|restart|stop|logs`: the production app as a LaunchAgent (macOS only; starts at login). Stop it
  before `npm run dev`; they share port 3030. After the move into `apps/web`, run `install` once more so the
  LaunchAgent's working directory is `apps/web`.
- `npm run backup` writes a backup now (`pg_dump` plus `secret.key` and library covers, in `RELIFE_BACKUP_DIR`; the nightly `backup`
  job does it at 03:30, needs the PostgreSQL 16 client tools, `RELIFE_PG_BIN` if they are not on PATH). `npm run restore` lists them,
  `npm run restore -- <file> [--yes] [--force] [--no-safety-backup]` restores one with ReLife stopped. `npm run import -- <export.zip>`
  restores an export into an empty install.
- Scripts under `apps/web/scripts/` run from `apps/web`: `npx tsx --env-file=../../.env scripts/<file>.ts`.
- If the checkout is in iCloud Drive, pause sync while moving folders; delete any "file 2" duplicates it makes.
