# Privacy

ReLife runs on your own machine. Your data lives in a Postgres database you control, and nothing leaves it unless you
connect a service or an AI model. The in-app page **Settings → Data & privacy** (`/you/settings/data`) shows the same
facts for your own install, built from the real code: the connector list, the AI call list, `LLM_MASK` and the last
30 days of AI calls. This file is the written version.

**No analytics or telemetry.** The app sends nothing about how you use it, to us or anyone else.

## What each source reads

Nothing syncs until you connect it in You → Connections. Each source declares how far its data travels
(`Connector.reach` in `apps/web/src/core/types.ts`):

| Reach | Meaning | Sources |
|---|---|---|
| This machine | Read on this machine, nothing is sent out. | Laptop activity, the iPhone Shortcuts inbox (the inbox file itself syncs through iCloud Drive) |
| Your network | A service on your own network. | Anki (AnkiConnect) |
| Public data | An open service that is sent nothing about you. | Exchange rates |
| Online service | Everything else: ReLife asks the service with your key or sign-in. | The other sources |

How a source connects, from what its Connect dialog asks for:

- **Sign-in with the service** (OAuth): ReLife keeps the tokens encrypted.
- **Browser sign-in** (shopping apps): you sign in once in a Chrome window; cookies stay in `data/browser/`.
- **API key**: sent only to that service.
- **Public username**: nothing secret.

Bank SMS and bank emails are not read. Spending comes from connected order apps (and bank CSV files you import).

## What goes to an AI model

Only when you set a model (`LLM_DEFAULT`, or `LLM_CHAT`, `LLM_PLAN`, `LLM_PARSE`). A `local` provider (Ollama, LM Studio,
`LOCAL_LLM_URL`) stays on your machine or network; any other provider is a cloud service. Every call is listed in
`apps/web/src/ai/uses.ts`, a test fails when a call is missing from it, and `llm_runs` records the task, model, token
counts and time (never the prompt).

| Call | What it sends |
|---|---|
| Ask your coach (`chat.ask`) | Your question and the last few messages, a digest of your last 28 days (routine and tracker averages, spending totals, top merchants, goals, quests, screen-time totals), your profile text, and what the coach's lookup tools return from your data. |
| Area one-liners (`briefs.area`) | The rule-written line for each area and the facts behind it. Only to reword it. |
| Sorting new sites and apps (`job.classify-sites`) | Names of websites and Mac apps ReLife does not know yet. No addresses, page titles or times. |
| Morning nudges (`job.daily-nudge`) | The same digest. |
| Goal drafts (`goals.draft`) | The goal you typed and the names and units of your trackers and routines. Sensitive measures (weight, calories, medication, symptoms) are left out. |
| Weekly review (`job.weekly-review`) | The same digest and the numbers behind each goal review that is due. |
| Starter routines in setup (`plan.onboarding-routines`) | What you wrote about yourself in setup, your goals text, your areas and existing routines. |
| Live alerts (`rule.watch`) | A table of today, yesterday and this week against your usual for spending, crypto, health and work. Only when something moved. |
| Reading an order page (`parse.orders.<app>`) | The visible text of one order-history page, when the app's own data was not usable. |
| The System's daily quests (`system.*`) | The quest candidates ReLife computed, your recent quests, patterns across areas and this week's screen-time totals. |

**Masking.** Unless `LLM_MASK=false`, long digit runs (account, card and phone numbers) and UPI handles are hidden
before a prompt leaves (`apps/web/src/ai/mask.ts`). Masking does not hide merchant names, amounts, routine names or
your profile text: those still go to a cloud model. Use a local model if that matters to you.

## Messages

Telegram, when you connect it: message text passes through Telegram's servers. The bot answers only your chat.

## Fetched without your data

- Exchange rates from `open.er-api.com`.
- Coin logos from CoinGecko, by symbol, for coins you hold.
- Library cover pictures from the page of a course or show you added (public addresses only).

## What never leaves

- The database and everything in it.
- The key that protects saved keys (`data/secret.key`, or `RELIFE_SECRET_KEY`).
- Each saved key goes only to its own service, never to an AI model.
- Browser profiles for shopping apps (`data/browser/`).
- Exports and backups, until you move them yourself.
- Window contents: the Mac watcher records only the name of the app in front and the time.

## Your copy of the data

- **Export** (`GET /api/export`, the Export button): a ZIP with one JSON Lines file per table, CSVs of entries, payments,
  trades and routine checks, and a manifest. It never contains saved keys, OAuth tokens, sync progress or device token
  hashes. Connections keep only their non-secret settings (a username, a URL). Import it into an empty install with
  `npm run import -- <file>`. ZIP64 is not used: a single file or archive over 4 GB fails with a clear error.
- **Backups** (`npm run backup`, nightly at 03:30): one `.tar.gz` of the database, `secret.key` and library covers in
  `RELIFE_BACKUP_DIR`. It is exact, so it **contains the key**: plain archives let anyone holding the file read your saved
  keys. Set `RELIFE_BACKUP_PASSPHRASE` to encrypt them (a lost passphrase is a lost backup), or keep the key in
  `RELIFE_SECRET_KEY`, which is then left out of the archive. A backup is never offered as a browser download.
- **Delete everything** (Settings → Data & privacy): removes everything ReLife knows about you, browser sign-ins and
  library pictures included. Signed-in devices, your region, the theme and `data/secret.key` stay. Backups and exports
  you already made are not touched: delete those yourself.
