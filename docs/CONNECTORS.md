# Connectors

A connector fetches data from one source and stores it untouched in `raw_events`; parsers then
turn it into entries, transactions, trades and holdings. Each connector lives in one file in
`src/connectors/` and is listed in `src/connectors/index.ts`.

A connector runs only after you connect it on the **Connectors** page. Connect opens a dialog for its
keys, which are stored encrypted in your local database; values already in `.env` fill any field you
leave blank. Disconnect forgets the keys but keeps sync progress. Every sync is safe to repeat:
events carry stable ids.

| Connector | Keys (dialog fields or `.env`) | Runs every | What it records |
|---|---|---|---|
| iPhone inbox | `ICLOUD_INBOX_PATH` (optional) | 1 min | Bank SMS, steps, health metrics, sleep, screenshot text |
| Exchange rates | none | 12 h | Daily USD rates for currency conversion |
| GitHub | `GITHUB_TOKEN`, `GITHUB_USER` (optional) | 1 h | Daily commits, PRs, reviews, issues |
| Binance | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_QUOTES`, `BINANCE_SYMBOLS` (optional) | 1 h | Balances, spot trades, P2P orders, Convert history |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_QUERY` (optional) | 15 min | Bank alert emails, food/grocery order emails |

## iPhone inbox

See [SHORTCUTS.md](SHORTCUTS.md). No keys needed.

## Exchange rates

Uses the free `open.er-api.com` endpoint (no key). Rates are stored per day in `fx_rates`, so old
transactions convert at the rate of their own day.

## GitHub

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Repository access: **All repositories** (or the ones you want counted, including private ones).
3. Permissions: **Contents: Read-only** and **Metadata: Read-only**. Nothing else.
4. Put it in `.env` as `GITHUB_TOKEN`. `GITHUB_USER` is only needed if the token's owner isn't you.

The first sync backfills 365 days, later syncs refresh the last 14. Counts come from GitHub's
contribution graph, so they match your profile (private contributions count only if you enabled
"Private contributions" on your profile).

## Binance

Create a **read-only** key:

1. Binance → Profile → **API Management** → Create API → System generated.
2. Tick **only "Enable Reading"**. Leave trading, margin, futures, withdrawals and transfers off.
3. Under IP access restrictions choose **Restrict access to trusted IPs only** and add your
   public IP (`curl ifconfig.me`). If your IP changes often, you can leave it unrestricted, but a
   read-only key is the minimum.
4. Put the key and secret in `.env` as `BINANCE_API_KEY` and `BINANCE_API_SECRET`.

On the first sync ReLife checks the key's permissions and **refuses to run** if the key can trade,
withdraw or transfer.

What it syncs:

- **Balances** every hour, valued in USD through each asset's USDT price. Simple Earn assets
  (`LDBTC`) are priced as the underlying coin.
- **Spot trades** for every asset you hold, against the quotes in `BINANCE_QUOTES`
  (default `USDT,FDUSD,USDC`). Add other pairs you traded but no longer hold to `BINANCE_SYMBOLS`,
  for example `BINANCE_SYMBOLS=SOL/BTC,DOGE/USDT`.
- **P2P orders** (INR on-ramp and off-ramp), completed orders only.
- **Convert** history.

Deposits and withdrawals are not imported yet.

The API only returns recent trades for pairs it hasn't seen before. For full history, export it
from Binance (Orders → Spot Order → Trade History → Export) and import the CSV:

```bash
npx tsx --env-file=.env scripts/binance-import.ts ~/Downloads/trade-history.csv
```

Import only the period before your API sync started; the same trade from both sources is counted
twice.

## Gmail

ReLife reads mail with a read-only OAuth token that stays on your machine.

1. Go to <https://console.cloud.google.com/>, create a project (any name, e.g. "ReLife").
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen**: User type **External**, fill in the app name and
   your email, add yourself under **Test users**. You don't need to publish it.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type
   **Desktop app**. Copy the client ID and secret into `.env` as `GMAIL_CLIENT_ID` and
   `GMAIL_CLIENT_SECRET`.
5. Run:

   ```bash
   npx tsx --env-file=.env scripts/gmail-auth.ts
   ```

   A browser opens; approve read-only access. Copy the printed `GMAIL_REFRESH_TOKEN` into `.env`.

While the consent screen is in "Testing", Google expires refresh tokens after 7 days. Re-run the
script when the dashboard shows a Gmail auth error, or set the consent screen to "In production"
(Google then shows an "unverified app" warning that you can click through for your own account).

**Which emails:** by default, mail from Axis Bank, Zomato, Swiggy, Zepto and Blinkit, plus
pre-debit notices. Override with `GMAIL_QUERY` using normal Gmail search syntax, e.g.

```
GMAIL_QUERY=from:(axisbank.com OR hdfcbank.net OR zomato.com OR swiggy.in)
```

The first sync looks back 30 days.

**What happens to each email:**

- **Bank alerts** become transactions. The same payment from SMS and email shares the bank
  reference number, so it's stored once.
- **Order emails** (Zomato, Swiggy, Zepto, Blinkit) don't create a second transaction. They attach
  the order id and item list to the matching bank payment (same amount within ₹1, within 45
  minutes). If the payment hasn't arrived yet, the email is marked failed and retried later.
- **Pre-debit notices** are recognised and skipped: they announce a future debit; the real debit
  alert records it.

Order email templates change. If items or totals stop showing up, add a sample to
`src/parsers/parsers.test.ts` and adjust `src/parsers/order-email.ts`.

## Adding a connector

1. Create `src/connectors/<id>.ts` exporting a `Connector` (`id`, `name`, `category`, `description`,
   `provides`, `fields`, `env`, `everyMinutes`, `sync`). `fields` are the inputs of its Connect dialog on
   /connectors; each names the env var the connector reads. In `sync`, call `ctx.emit()` with a stable `externalId` per event and
   save progress with `ctx.setCursor()`.
2. Add it to the list in `src/connectors/index.ts`.
3. Write a parser in `src/parsers/` that matches its `source`, add it to `src/parsers/index.ts`
   (before `llmFallback`), and add a fixture in `src/parsers/fixtures/`.
4. Document its env vars here and in `.env.example`.
