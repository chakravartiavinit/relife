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

- Pages: Today (`/`, things to do now), Overview (`/overview`, looking back), five areas that share one
  template (`PageHeader` → `KpiStrip` → cards), Habits (`/habits`, routines + trackers), Insights. Inbox,
  Connectors and Settings sit in the sidebar footer. Navigation lives in `src/ui/components/nav.tsx`.
- `src/app/`: Next.js 16 App Router pages and `actions.ts` (all server actions). Cache Components is
  on: DB reads go in an async child component that calls `await connection()`, wrapped in
  `<Suspense>` with a skeleton sized like the content. See `src/app/page.tsx`.
- `src/core/`: ingest pipeline, schedules, metrics, quick-log grammar, FX, time zones, connector keys.
- `src/domain/`: pure TypeScript (recurrence, streaks, FIFO P&L, money formatting). No DB, no React.
- `src/connectors/`, `src/parsers/`, `src/rules/`, `src/ai/jobs/`: the four extension points.
- `src/worker/`: long-running process (bot, reminders, syncs, rules, AI). `src/bot/`: Telegram.
- `src/ui/`: tokens and components. `src/app/globals.css` holds the design tokens.
- Vendored UI code: `src/ui/beui/` (beui.dev) and `src/ui/dither-kit/` (tripwire.sh, local patches in
  its README). Change them only to fit ReLife tokens.

## Adding things

- **New metric or routine:** no code. Use the UI, ⌘K (`coffee 2`) or Telegram. Trackers are created
  on first use.
- **New data source:** one file in `src/connectors/<id>.ts` implementing `Connector`
  (`src/core/types.ts`), added to the array in `src/connectors/index.ts`. Declare `fields` (the
  Connect dialog inputs) and required `env` keys, emit raw events with stable `externalId`s, store
  progress with `ctx.setCursor`. Give it a `description` and `provides` chips, and optionally a logo
  in `public/connectors/` mapped in `src/ui/components/connector-market.tsx`. Document it in
  `docs/CONNECTORS.md` and `.env.example`.
- **New message format** (bank SMS, order email): one file in `src/parsers/` added to
  `src/parsers/index.ts` before the LLM fallback, plus a fixture in `src/parsers/fixtures/`
  (`{ event, expected }`). `npm test` runs every fixture.
- **New alert:** one file in `src/rules/` added to `src/rules/index.ts`.
- **New achievement:** append to `src/achievements/index.ts`. `check` reads the shared stats and returns
  progress, so locked ones show how close you are.
- **New AI job:** `src/ai/jobs/<id>.ts`, scheduled in `src/worker/index.ts`. Use `model(task)`
  from `src/ai` and log through `src/ai/run.ts`.
- **Odd fields:** put them in the `meta` JSON column; promote to a real column only when queried.

## Data rules

- Per-day values are keyed by the user's local date (`core/time.localDate`), never UTC dates.
- Money is stored in its original currency; convert at read time with `core/fx.convert`.
- Re-running any sync or parse must be safe: dedupe on `(source, externalId)` / `externalRef`.
- Nothing syncs until the user connects it on /connectors. Keys typed there are stored encrypted in
  `connections.secrets_encrypted` and loaded into a key map (`core/secrets.ts`); `.env` only fills blanks.
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
