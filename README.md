<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="">
</p>

<h1 align="center">ReLife</h1>

<p align="center">Level up your real life, one day at a time.</p>

ReLife is a life RPG. It tracks Health, Mind, Skills, Wealth, Hobbies and People in one place, pulls in what it
can on its own (Binance, your order apps, GitHub, your laptop, what you watch), gives you daily
quests, and messages you on Telegram when something in your data deserves a look. An AI model of your choice turns
the numbers into quests, nudges and plans.

Local-first: everything runs on your machine, and your data stays in your own Postgres.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/today-dark.png">
  <img alt="ReLife Today page: what needs you first, the day's numbers, the quest log, money today, yesterday and The System's quests" src="docs/images/today-light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/wealth-dark.png">
  <img alt="ReLife Wealth overview: net worth, this month's spending pace against a usual month, subscriptions, investment profit and 12 months of spending" src="docs/images/wealth-light.png">
</picture>

Screenshots use mock data (`npm run dev:mock`).

**How it all works:** open [docs/architecture.html](docs/architecture.html) in a browser for the full guide with
diagrams (processes, data flow, data model, job engine, nudges, AI, security and trade-offs).

## What's inside

- **Today** (`/`): a morning briefing. What needs you first (a position near liquidation, a renewal, a medicine
  running low, a failing sync), the day's key numbers, the quest log (routines, medicines, and daily goals like
  water in millilitres with a 2–4 L target), money spent today, a look at yesterday, and The System's quests.
- **Live**: open pages refresh when new data lands, and each new bank debit or credit pops up once.
- **The System**: daily quests in the style of Solo Leveling. The AI picks what to train from what's slipping and
  what you want to improve; tested rules keep targets near recorded capacity, with ranks E–S. Missed daily quests
  pause new quests and offer a smaller step, rest, or a priorities review instead of penalties. It also spots spending habits from order items and sets at
  most one habit quest a day.
- **Progress** (`/profile`): your character sheet. Level, title, streak, the week per area, consistency,
  achievements, weekly quests, chests and streak freezes.
- **Areas**: Health, Mind, Skills, Wealth, Hobbies and People, each opening with its key numbers, then charts
  and routines.
- **Wealth**, from your real data:
  - **Overview**: this month's pace against a usual month (one-off big orders counted once), 12 months of
    spending by category, the apps you order from, repeat buys, investments, subscriptions, all-time totals and
    the latest money nudges.
  - **Spending**: by category, merchant and item, with habits and every transaction.
  - **Portfolio**: Binance spot and futures. Open positions first with a runway to liquidation, holdings,
    where the profit and loss came from (spot and futures only, FIFO), and every trade, P2P order, transfer and
    reward.
  - **Subscriptions**: what renews and when, with logos and an add or edit dialog.
- **Activity** (`/activity`): everything you do on the Mac, from the Chrome extension and a Mac app watcher:
  time by kind (learning, deep work, fun, social…) and where it went, top sites and apps, and the pages and
  videos it was spent on. New sites and apps are sorted once by your AI model; tap a kind to change it.
- **Library**: courses, shows, anime and video series. While an episode plays (Crunchyroll, Netflix, YouTube
  playlists, course sites), the extension adds the series by itself and logs each episode with its length and
  how far you got.
- **Habits**: every routine, medicine and tracker, with streaks and history.
- **Insights**: alerts, nudges, weekly reviews and plans, and questions about your data.
- **Inbox**: messages that couldn't be read and payments without a category.
- **Connectors**: connect data sources, Telegram and AI providers. Each shows when it last synced and when it
  syncs next.
- **Welcome** (`/welcome`): first-run setup on one small card, a question at a time: your name, your day,
  areas, what to train, targets, tone and goals, then routines from a starter list or built by your AI model.

## Nudges

ReLife watches your data and messages you on Telegram when something moves: a spending spike, the month heading
over your usual, a repeat buy above its usual, a new subscription, a coin swing, or a futures position close to
liquidation. Code works out every number; the AI only decides what's worth a message and words it as a short,
phone-style notification. Each topic is sent at most once a day (weekly trends once a week), at most two a day,
and never in quiet hours. A position within 5% of its liquidation price is always sent.

Checks run hourly in the daytime and the moment new data lands (a sync, new orders, a subscription added).
Every message goes through one outbox, so Settings → Notifications decides quiet hours, daily caps and repeats
per category.

## Run it

Requirements: Node 20.9+, Docker, and Google Chrome for the shopping-app connectors.

```bash
npm install                     # also turns on the git hooks
cp .env.example .env            # only DATABASE_URL is required
docker compose up -d            # Postgres on 127.0.0.1:5442
npm run db:push                 # create tables
npm run dev                     # http://127.0.0.1:3030 plus the worker
```

Two processes start together:

- **web**: the Next.js dashboard and server actions.
- **worker**: the job engine (connector syncs, parsing, reminders, nudges, XP, quests, AI), the Telegram bot and
  the Mac app watcher. The Connectors page shows a notice when it isn't running.

Jobs live in Postgres, so a restart never loses or repeats one: missed daily jobs catch up once, failed syncs
back off, and a connector syncs as soon as you connect it.

ReLife uses port 3030 because 3000 is often taken by other projects, and two dev servers on one port make pages
reload endlessly.

### Run it in the background (recommended for daily use)

```bash
npm run build
npm run service -- install      # starts at login, restarts if it crashes; http://127.0.0.1:3030
npm run service -- restart      # after pulling or changing code: rebuilds, then restarts
npm run service -- logs         # follow ~/Library/Logs/ReLife/relife.log
npm run service -- stop         # before `npm run dev`, which uses the same port
npm run service -- uninstall    # remove it
```

It runs the production build (`npm start`) from a LaunchAgent in `~/Library/LaunchAgents/com.relife.app.plist`.
Postgres comes back on its own (`restart: unless-stopped`) once Docker Desktop starts at login.

**Make it feel like an app:** open http://127.0.0.1:3030 in Chrome and choose **Install ReLife** in the address
bar menu (Safari: **File → Add to Dock**). It gets a Dock icon and its own window.

## Connect your data

Open **Connectors** in the sidebar. Nothing syncs until you connect it. **Connect** asks for that service's keys
and stores them encrypted in your local database; values already in `.env` fill any field you leave blank.

| What | You need | Guide |
|---|---|---|
| Reminders, nudges, quick logging, `/ask` | Telegram bot token and your chat ID | [CONNECTORS.md](docs/CONNECTORS.md) |
| Binance: spot, futures, P2P, Convert, deposits, rewards | Read-only API key | [CONNECTORS.md](docs/CONNECTORS.md#binance) |
| Zomato, Swiggy, Blinkit, Zepto, Flipkart, Amazon orders with items; MakeMyTrip bookings | Log in once in a Chrome window ReLife opens | [CONNECTORS.md](docs/CONNECTORS.md) |
| GitHub commits, PRs and reviews | Fine-grained token | [CONNECTORS.md](docs/CONNECTORS.md#github) |
| Codeforces, AtCoder, CodeChef, Lichess, Chess.com | Your public handle | Connectors page |
| LeetCode problems and rating; Duolingo XP and streak | Your public username | Connectors page |
| Strava workouts; Oura, WHOOP and Withings sleep, recovery and weight; Google Calendar meeting and focus time | Sign in with the service (your own free app) | [CONNECTORS.md](docs/CONNECTORS.md#signing-in-oauth) |
| WakaTime coding time, Monkeytype typing, Todoist tasks, Toggl time, RescueTime productivity, Hevy gym workouts, Readwise highlights, Last.fm music, Steam gaming | A personal key from each service | [CONNECTORS.md](docs/CONNECTORS.md#personal-data-connectors) |
| Codewars kata, Letterboxd films, Open Library books, Anki flashcards | Your public username, or the AnkiConnect add-on | [CONNECTORS.md](docs/CONNECTORS.md#personal-data-connectors) |
| Laptop time per site and app, shows and courses you watch | The browser extension and a shared token | [extension/README.md](extension/README.md) |
| Steps, sleep, Health data (iPhone) | iOS Shortcuts writing to an iCloud Drive file | [SHORTCUTS.md](docs/SHORTCUTS.md) |
| Exchange rates | Nothing: connect FX | Connectors page |
| AI | A key for Anthropic, OpenAI, Google or OpenRouter, or a local model | Connectors page |

Prefer a vault? Keep keys in [dotsafe](docs/CONNECTORS.md) and start with `npm run dev:vault`.

Binance's API only reaches back about 1.5–2 years. For older trades, download the Transaction History statement
and run `npx tsx --env-file=.env scripts/binance-import.ts <file.csv>`.

## Daily use

Every day, streak and time in ReLife follows the time zone in **Settings** (set on first run), not the
server's or the browser's clock.

- **⌘K** logs anything: `water 250`, `mood 4`, `read 30 min`, `spent 120 chai`.
- **Telegram**: tap ✅ on reminders, 💬 Why? on a nudge, and use `/today`, `/quests`, `/status`, `/log`,
  `/spent`, `/mood`, `/sleep`, `/wake` and `/ask`.
- **Subscriptions**: press **Add subscription**, pick a service or type any name, and you get a reminder before
  each charge.
- **Inbox** lists messages that couldn't be read and payments without a category. Fix a category once and
  ReLife remembers it for that merchant.

## Mock mode

`npm run dev:mock` fills a separate `relife_mock` database with about four months of random data and opens it on
http://127.0.0.1:3001, so you can check every page with something on it. Your real data is never touched. Stop
`npm run dev` first; the two share a build folder. `npm run mock:seed -- 42` reseeds with a fixed seed.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web + worker with reload, on port 3030 |
| `npm run dev:vault` | The same, with keys injected from a dotsafe vault |
| `npm run dev:mock` | Random data in `relife_mock`, on port 3001 |
| `npm run build && npm start` | Production mode |
| `npm run service -- install` | Run in the background at login (see above) |
| `npm test` | Domain, parser, connector, job engine, nudge and key-encryption tests |
| `npm run typecheck` | TypeScript |
| `npm run db:push` | Apply schema changes |
| `npx tsx --env-file=.env scripts/binance-import.ts <csv...>` | Import Binance trade exports or Transaction History statements |

## Contributing

Rules for code, data, UI and commits are in [AGENTS.md](AGENTS.md); coding agents read the same file. The design
and its reasoning are in [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) and the guide in
[docs/architecture.html](docs/architecture.html). Animation audits and plans live in [plans/](plans/README.md).

Adding things is one file plus one line: a connector in `apps/web/src/connectors/`, a message format in `apps/web/src/parsers/`
(with a fixture), an alert in `apps/web/src/rules/`, a job in `apps/web/src/jobs/index.ts`, an AI job in `apps/web/src/ai/jobs/`.

Git hooks in `.githooks/` (turned on by `npm install`) keep the repo clean:

- **pre-commit** blocks secret-looking strings, `.env` files, `data/`, keys and database dumps, iCloud
  duplicates like `routes 2.ts`, and files over 2 MB.
- **pre-push** runs the typecheck and tests.

Never commit real bank messages, account numbers or screenshots of your own data. Parser fixtures and
screenshots use fake data (`npm run dev:mock`).

## Privacy and security

- The web server binds to 127.0.0.1, and the Telegram bot answers only your chat.
- Connector keys are encrypted with AES-256-GCM. The encryption key is created in `data/secret.key` on first
  use, or set `RELIFE_SECRET_KEY`. Back it up with your database: without it, saved keys can't be read and
  you'll need to enter them again.
- Exchange keys must be read-only; the Binance connector refuses keys that can trade or withdraw.
- Shopping apps are read through your own logged-in Chrome profile, kept in `data/browser/`. This is for
  personal use only.
- The browser extension sends only to your own ReLife, never in incognito, and only the site, path and title of
  the tab in front.
- Prompts mask account numbers and UPI handles unless you set `LLM_MASK=false`. Parsing can run on a local model
  so order pages never leave your Mac. Every AI call is logged with its cost in `llm_runs`.

## Phone access

Install [Tailscale](https://tailscale.com) on the Mac and iPhone, then run `tailscale serve --bg 3030` on the
Mac. Open the `https://<your-mac>.<tailnet>.ts.net` address it prints in Safari and add it to the Home Screen to
use it as an app. Only your own devices can reach it; nothing is exposed to the internet. ReLife answers only on `127.0.0.1`,
`localhost` and `*.ts.net` addresses; add any other name you open it through (a Cloudflare Tunnel, say) to
`RELIFE_ALLOWED_HOSTS` in `.env`. Steps and sleep keep flowing
through the iCloud file even when the Mac is away (see [SHORTCUTS.md](docs/SHORTCUTS.md)).

## License

[AGPL-3.0-or-later](LICENSE). You can use, change and self-host ReLife freely. If you run a modified version as
a service for other people, you must share your changes under the same license. Vendored components keep their
own MIT notices (see Credits).

## Credits

- Charts: [EvilCharts](https://evilcharts.com) (MIT), on [Recharts](https://recharts.org) (MIT).
- Motion components: [beUI](https://beui.dev) (MIT).
- Connector and brand logos (`apps/web/public/connectors`, `apps/web/public/brands`): [Simple Icons](https://simpleicons.org)
  (CC0) and [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT); a few brands Simple Icons doesn't carry
  use their own app icons. Coin logos come from [CoinGecko](https://www.coingecko.com) and are cached locally.
  Trademarks belong to their owners.
- Routine, hobby and shopping-category pictures (`apps/web/public/routines`, `apps/web/public/hobbies`, `apps/web/public/categories`):
  [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) by Microsoft (MIT).
- The ReLIFE name and logo (`packages/brand/logo/`, `apps/web/public/brand/`, `apps/web/src/app/icon.png`, `apps/web/src/app/apple-icon.png`,
  `extension/icons/`)
  belong to their owners (© YayoiSo/comico/ReLIFE Laboratory) and are used as a fan tribute. They are not
  covered by this project's AGPL license.
