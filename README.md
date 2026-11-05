# ReLife

A second chance, built from small daily changes. ReLife tracks Health, Mind, Skills, Wealth and
Relationships in one place, automates what it can (Binance, GitHub, bank SMS, Gmail), reminds you
on Telegram, and lets a model of your choice turn the data into nudges and plans.

Local-first: everything runs on your machine. Design and decisions are in
[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/today-dark.png">
  <img alt="ReLife Today page: a sky header with the school and sakura line-art, a five-step setup checklist, routines and today's numbers" src="docs/images/today-light.png">
</picture>

## Run it

Requirements: Node 20.9+, Docker.

```bash
npm install
cp .env.example .env            # fill in what you use; everything is optional except DATABASE_URL
docker compose up -d            # Postgres on 127.0.0.1:5442
npm run db:push                 # create tables
npm run dev                     # dashboard on http://127.0.0.1:3000 + the worker
```

`npm run seed:demo` adds sample routines, subscriptions and two weeks of data if you want to see
the dashboard filled in. Don't run it on your real data.

Two processes start together:

- **web**: the Next.js dashboard.
- **worker**: Telegram bot, reminders, connector syncs, alerts and AI jobs. The dashboard shows a
  banner when it is not running.

## Connect your data

| What | How | Guide |
|---|---|---|
| Reminders, quick logging | Telegram bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`) | [CONNECTORS.md](docs/CONNECTORS.md) |
| Bank SMS, steps, sleep (iPhone) | iOS Shortcuts writing to an iCloud Drive file | [SHORTCUTS.md](docs/SHORTCUTS.md) |
| Binance trades and balances | Read-only API key | [CONNECTORS.md](docs/CONNECTORS.md#binance) |
| GitHub commits and PRs | Fine-grained token | [CONNECTORS.md](docs/CONNECTORS.md#github) |
| Axis alerts, Zomato / Zepto / Blinkit orders | Gmail OAuth (`scripts/gmail-auth.ts`) | [CONNECTORS.md](docs/CONNECTORS.md#gmail) |
| AI (any provider) | `LLM_DEFAULT=provider:model` + key, or a local model | `.env.example` |

Settings → Data sources shows what is connected and has a "Sync now" button per source.

## Daily use

- **Today** shows routines, medicines, goals like water, payments due and suggestions.
- **⌘K** logs anything: `water 250`, `mood 4`, `read 30 min`, `spent 120 chai`.
- **Telegram**: tap ✅ on reminders, `/today`, `/log`, `/spent`, `/sleep`, `/wake`, `/ask`.
- **Inbox** lists messages that could not be read and payments without a category. Fixing a
  category once teaches it for that merchant.

## Phone access

Install [Tailscale](https://tailscale.com) on the Mac and iPhone, run the dashboard with
`next dev -H 0.0.0.0` or put it behind `tailscale serve`, and open it from Safari. Add it to the Home
Screen to use it as an app. Nothing is exposed to the internet.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web + worker with reload |
| `npm run build && npm start` | Production mode |
| `npm test` | Domain, parser and worker tests |
| `npm run typecheck` | TypeScript |
| `npm run db:push` | Apply schema changes |
| `npx tsx --env-file=.env scripts/binance-import.ts <csv...>` | Import Binance trade history exports |

## Privacy

- Secrets stay in `.env`, which git ignores.
- The web server binds to 127.0.0.1, and the Telegram bot answers only your chat.
- Exchange keys must be read-only; the Binance connector refuses keys that can trade or withdraw.
- Prompts mask account numbers and UPI handles unless you set `LLM_MASK=false`. Parsing can run on a
  local model so bank SMS never leaves your Mac.

The ReLIFE name and capsule logo come from the anime (© YayoiSo/comico/ReLIFE Laboratory). They are
fine for a private build. Replace them before any public release.
