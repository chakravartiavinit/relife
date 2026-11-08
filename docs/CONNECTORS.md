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

## Keeping keys in dotsafe

[dotsafe](https://dotsafe.dev) keeps your keys in an encrypted vault on your Mac instead of `.env` or the
database. ReLife reads them from its environment, so nothing in the code changes per connector.

1. In the dotsafe app: Settings → Agents → Install, so `dotsafe` is on your PATH.
2. In this folder: `dotsafe unlock --for 8h`, then `dotsafe import` to move `.env` into the vault. That links
   the folder (`.dotsafe.json`, safe to commit: ids only). Add more with `dotsafe set ANTHROPIC_API_KEY`.
3. Start with `npm run dev:vault` instead of `npm run dev`. Both the web app and the worker get the keys.
4. Leave the key fields on Connectors blank. Keys saved there win over the vault, so remove any you moved
   (Disconnect, then Connect again with the fields empty). The dialog shows *From your dotsafe vault*.

Once everything is in the vault you can empty the secrets in `.env` (keep `DATABASE_URL` there or move it too).
The pre-commit hook also runs `dotsafe scan --staged` when dotsafe is installed and the folder is linked.

Claude Code can use the vault without seeing values: `claude mcp add dotsafe -- dotsafe mcp`.

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

## Laptop activity (Chrome extension and Mac apps)

Two local trackers feed one timeline (Activity page):

- **Chrome extension** (`extension/`, see its README): time on each site, YouTube video and course page while
  the tab is in front and you're active or a video plays. It posts to `POST /api/activity` with the token you set
  on Connectors → Laptop activity (`ACTIVITY_TOKEN`).
- **Mac apps**: the worker checks the app in front every 15 seconds with `lsappinfo` (no permission prompt) and
  the idle time with `ioreg`. App names only, no window titles. Browsers are skipped because the extension covers
  them. Set `ACTIVITY_APPS=off` to turn it off.

Everything is sorted into learning, work, entertainment, social, messages, shopping, news or other
(`src/domain/activity.ts`; YouTube by title and channel). Daily totals go to `learning.minutes`, `screen.work`,
`screen.entertainment` and `screen.social`, so they count for XP, patterns and the System's quests, and the coach
sees a 7-day summary (sites, apps and video titles; never URLs or page contents). Raw stretches are deleted after
90 days. Pressing **Track this course** in the extension creates a course under Skills → Learning that fills in
its own minutes and progress.

## Codeforces, CodeChef and AtCoder

Your public handle is all they need: no key, no login. They feed the Skills area.

- **Codeforces** uses the official API: every submission (problems solved, submissions) and your contest rating.
- **AtCoder** uses [AtCoder Problems](https://kenkoooo.com/atcoder/) for submissions and your public contest
  history (`atcoder.jp/users/<you>/history/json`) for rating. AtCoder Problems can lag behind by weeks.
- **CodeChef** has no public API, so it reads your public profile (contest rating history) and the public
  "recent activity" pages (submissions, shown in India time). If CodeChef changes those pages the sync
  shows an error rather than wrong numbers.

A problem counts once, on the day you first got it accepted. Each site adds to `cp.solved` and
`cp.submissions`; ratings go into `cp.rating-codeforces`, `cp.rating-codechef` and `cp.rating-atcoder`.
Solving a problem earns Skills XP (verified), the Skills page shows a Competitive programming card, and the
System can set quests on problems solved or rating. Hourly; the first sync backfills about 90 days.

## Lichess and Chess.com

Your public username is all they need: no key, no login. Each feeds the **Chess** hobby (Hobbies page).

- **Lichess** reads your public activity feed (games, wins, draws, losses and the rating after each day)
  and today's rating from your profile. Its game export isn't used, so minutes are estimated from the game speed (bullet 2, blitz 7, rapid 20,
  classical 50 minutes a game).
- **Chess.com** reads your monthly game archives: exact minutes from each game's start and end times
  (correspondence games don't count as time), results, and your rating in the time control you play most.

Both sync every hour. The first sync backfills about 90 days, later ones the last 3. Minutes go into the
`chess` tracker (summed with anything you log by hand, like "chess 30"); games, wins and each site's rating
go into `chess.games`, `chess.wins`, `chess.rating-lichess` and `chess.rating-chesscom`, which show on the
Chess card and can be picked in Settings → The System as something to improve.

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

- **Balances** every hour, Spot plus the Funding wallet (where P2P buys land), valued in USD
  through each asset's USDT price. Simple Earn assets (`LDBTC`) are priced as the underlying coin.
  Portfolio hides balances worth under $1.
- **Spot trades** on every pair you ever traded (first sync), then new trades for those pairs and for
  every asset you hold, against the quotes in `BINANCE_QUOTES`
  (default `USDT,FDUSD,USDC`). Add other pairs you traded but no longer hold to `BINANCE_SYMBOLS`,
  for example `BINANCE_SYMBOLS=SOL/BTC,DOGE/USDT`.
- **P2P orders** (INR on-ramp and off-ramp), completed orders only, from the start.
- **Convert** history.
- **USDⓈ-M futures**: wallet, open positions, and every income entry (closed P&L, funding, fees,
  transfers). The API only reaches back a few months, so the first sync also asks Binance for yearly
  download files of older futures history (three years).
- **Deposits, withdrawals and Binance Pay** (money in and out). Shown on Portfolio for information;
  profit and loss comes only from spot and futures orders.

The first sync checks every spot pair once (Binance has no list of pairs you traded), so it takes
about 20 minutes. Later syncs read only what's new.

Coin names and logos come from CoinGecko's public API the first time a coin appears (only the
symbol is sent) and are kept in `data/coins`.

The API returns about two years of spot trades. For anything older, export your **Transaction History
statement** from Binance (Orders → Assets History → download icon; up to 12 months per file) and import it.
Binance keeps roughly 1.5–2 years there too, so trades older than that are gone for good; the Portfolio page
then counts sales of those coins at break-even and says how much is affected:

```bash
npx tsx --env-file=.env scripts/binance-import.ts ~/Downloads/statement.csv
```

The script rebuilds trades from the statement's lines and keeps only those older than the first trade the API
returned, so nothing is counted twice. Spot trade history exports work too.

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

## Shopping apps (Swiggy, Zomato, Blinkit, Zepto, Flipkart, Amazon)

These apps have no public API, so ReLife reads your own order history the way you would: in Chrome,
logged in as you. Personal use only, and not an official integration.

1. On Connectors, open the app and press **Open login window**. A normal Chrome window opens.
2. Log in (phone OTP included) and close the window once you see your account.
3. Press **Connect**. Every 6 hours the worker opens the order-history page in a hidden window with the
   saved session, reads the order data the page loads, and falls back to your AI model reading the page
   text when that data isn't recognised.

- Sessions live in `data/browser/<app>` (git-ignored). Delete that folder to forget a login.
- Uses your installed Google Chrome; set `CHROME_PATH` in `.env` if it's somewhere else.
- Each order is matched to its bank payment (same amount within 3 hours) and adds its items and order id
  to it. Orders with no payment after two days (wallet, card, cash on delivery, or older than your bank
  data) become their own transaction on the app's account, so nothing is counted twice or missed.
- Cancelled and failed orders are skipped.
- If an app moves its order page, paste the new address into the Connect dialog's *Order history page*.
  The Zomato, Blinkit and Zepto addresses are best guesses until confirmed on a real account.
- Logged out (sessions expire every few weeks): the connector shows "Logged out of …"; log in again.
- Risks: automated access may go against an app's terms, and it breaks when the site changes.

## Adding a connector

1. Create `src/connectors/<id>.ts` exporting a `Connector` (`id`, `name`, `category`, `description`,
   `provides`, `fields`, `env`, `everyMinutes`, `sync`). `fields` are the inputs of its Connect dialog on
   /connectors; each names the env var the connector reads. In `sync`, call `ctx.emit()` with a stable `externalId` per event and
   save progress with `ctx.setCursor()`.
2. Add it to the list in `src/connectors/index.ts`.
3. Write a parser in `src/parsers/` that matches its `source`, add it to `src/parsers/index.ts`
   (before `llmFallback`), and add a fixture in `src/parsers/fixtures/`.
4. Document its env vars here and in `.env.example`.
