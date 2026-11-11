# Connectors

A connector fetches data from one source and stores it untouched in `raw_events`; parsers then
turn it into entries, transactions, trades and holdings. Each connector lives in one file in
`src/connectors/` and is listed in `src/connectors/index.ts`.

A connector runs only after you connect it on the **Connectors** page. Connect opens a dialog for its
keys, which are stored encrypted in your local database; values already in `.env` fill any field you
leave blank. Before saving, most connectors make one quick request to test the key or username, so a
typo shows in the dialog instead of as a failing sync later (network trouble doesn't block saving).
Disconnect forgets the keys but keeps sync progress. Every sync is safe to repeat: events carry stable ids.

| Connector | Keys (dialog fields or `.env`) | Runs every | What it records |
|---|---|---|---|
| iPhone inbox | `ICLOUD_INBOX_PATH` (optional) | 1 min | Steps, health metrics, sleep |
| Exchange rates | none | 12 h | Daily USD rates for currency conversion |
| GitHub | `GITHUB_TOKEN`, `GITHUB_USER` (optional) | 30 min | Daily commits, PRs, reviews, issues |
| Binance | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_QUOTES`, `BINANCE_SYMBOLS` (optional) | 15 min | Balances, spot and futures, P2P orders, Convert, transfers, rewards |
| Laptop activity | `ACTIVITY_TOKEN` | live | Time per site and Mac app, shows and courses you watch |
| Codeforces, AtCoder, CodeChef, LeetCode, Codewars | your handle | 1 h | Problems solved, contest ratings, Codewars honor |
| Lichess, Chess.com | your username | 1 h | Games, ratings |
| Strava | sign in (your app's client ID and secret) | 1 h | Active minutes; running, cycling, walking and swimming distance |
| Oura | sign in (your app's client ID and secret) | 1 h | Sleep, sleep score, readiness, HRV, resting heart rate, steps |
| WHOOP | sign in (your app's client ID and secret; https only) | 1 h | Recovery, HRV, resting heart rate, sleep, strain |
| Withings | sign in (your app's client ID and secret) | 1 h | Weight, body fat, sleep, steps |
| Google Calendar | sign in (your OAuth client's ID and secret) | 1 h | Meeting minutes, Focus time minutes |
| WakaTime | `WAKATIME_API_KEY` | 1 h | Coding time per day, top language and project |
| Monkeytype | `MONKEYTYPE_APE_KEY` | 2 h | Typing speed, accuracy, practice minutes |
| Duolingo | your username | 1 h | XP per day, streak |
| Todoist | `TODOIST_API_TOKEN` | 1 h | Tasks completed per day |
| Last.fm | `LASTFM_USERNAME`, `LASTFM_API_KEY` | 1 h | Songs and listening time per day, top artist |
| Steam | `STEAM_API_KEY`, `STEAM_ID` | 30 min | Gaming minutes per day, top game |
| Toggl Track | `TOGGL_API_TOKEN` | 1 h | Tracked time per day, top project |
| RescueTime | `RESCUETIME_API_KEY` | 2 h | Productivity pulse, productive and distracting minutes |
| Hevy | `HEVY_API_KEY` (needs Hevy Pro) | 1 h | Gym workouts, minutes, weight lifted |
| Readwise | `READWISE_TOKEN` | 2 h | Highlights made per day |
| Letterboxd | your username | 2 h | Films you log in your diary |
| Open Library | your username | 2 h | Books you mark as read |
| Anki | nothing (AnkiConnect add-on, Anki open) | 1 h | Cards reviewed, study minutes |
| Swiggy, Zomato, Blinkit, Zepto | a Chrome login | 2 h | Orders with items |
| Flipkart, Amazon India | a Chrome login | 6 h | Orders and returns |
| MakeMyTrip | a Chrome login | 6 h | Flights, hotels, trains and buses you booked |

Spending comes only from the order apps you connect: bank SMS and bank emails are not read, so payments to people
(UPI transfers) aren't tracked. Log anything else with ⌘K (`spent 120 chai`). Open pages refresh on their own when
any sync brings new data.

Every per-day number is counted on your own calendar day, in the time zone from Settings.

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

The first sync backfills 365 days, later syncs refresh the last 14.

- **Commits in the last 14 days** come from GitHub's commit search, counted on your local day. The contribution
  graph can take hours to count a push and groups days in US Pacific time; search sees a push within minutes.
- **Older commits** come from the contribution graph, so they match your profile but keep GitHub's day.
- **Pull requests, reviews and issues** come from the contribution graph, each on the local day it happened.

A commit counts only when its author email is linked to your GitHub account and you own, collaborate on, or have
starred or forked the repository (GitHub's rule for contributions). Private repositories count only if the token
can read them and "Private contributions" is on in your profile.

## Laptop activity (Chrome extension and Mac apps)

Two local trackers feed one timeline (Activity page):

- **Chrome extension** (`extension/`, see its README): time on each site, YouTube video and course page while
  the tab is in front and you're active or a video plays. It posts to `POST /api/activity` with the token you set
  on Connectors → Laptop activity (`ACTIVITY_TOKEN`).
- **Mac apps**: the worker checks the app in front every 15 seconds with `lsappinfo` (no permission prompt) and
  the idle time with `ioreg`. App names only, no window titles. Browsers are skipped because the extension covers
  them. Set `ACTIVITY_APPS=off` to turn it off.

Everything is sorted into learning, work, entertainment, social, messages, shopping, news or other
(`src/domain/activity.ts`; YouTube by title and channel). A site or Mac app the built-in list doesn't know is
sorted once by your AI model (the `activity:classify` job, hourly; only the name is sent). Your own pick, from the
extension popup or the Activity page, always wins and re-sorts past time too.

Daily totals go to `learning.minutes`, `screen.work`, `screen.entertainment` and `screen.social`, so they count for
XP, patterns and the System's quests, and the coach sees a 7-day summary (sites, apps and page titles; never URLs or
page contents). Raw stretches are deleted after 90 days.

**Library.** Pressing **Track this** in the extension adds a course, show, video series or book. While an episode or
lesson plays, its series is added by itself (a show on an entertainment site, a course on a learning one), and
every episode is kept for good in `library_episodes`: its name, number, season, length, how far you got and the
time spent. Library cards on Skills, Hobbies and Activity show the last one and open the full list.

## Codeforces, CodeChef, AtCoder and LeetCode

Your public handle is all they need: no key, no login. They feed the Skills area. You can paste the handle, `@handle`
or your profile link; Connect checks that the handle exists.

- **Codeforces** uses the official API: every submission (problems solved, submissions) and your contest rating.
- **AtCoder** uses [AtCoder Problems](https://kenkoooo.com/atcoder/) for submissions and your public contest
  history (`atcoder.jp/users/<you>/history/json`) for rating. AtCoder Problems can lag behind by weeks.
- **CodeChef** has no public API, so it reads your public profile (contest rating history) and the public
  "recent activity" pages (submissions, shown in India time). If CodeChef changes those pages the sync
  shows an error rather than wrong numbers.
- **LeetCode** reads your public profile: submissions per day from the profile calendar (on LeetCode's UTC
  day), contest rating history, and problems solved from your last 20 accepted submissions, the only ones
  LeetCode shows. Days older than those 20 keep their submissions but get no solved count rather than a wrong one.

A problem counts once, on the day you first got it accepted. Each site adds to `cp.solved` and
`cp.submissions`; ratings go into `cp.rating-codeforces`, `cp.rating-codechef`, `cp.rating-atcoder` and `cp.rating-leetcode`.
Solving a problem earns Skills XP (verified), the Skills page shows a Competitive programming card, and the
System can set quests on problems solved or rating. Hourly; the first sync backfills about 90 days.

## Lichess and Chess.com

Your public username is all they need: no key, no login. Each feeds the **Chess** hobby (Hobbies page). A pasted
profile link or `@name` works too.

- **Lichess** reads your games from Lichess's public games export (no key): each game's real start and end give
  the minutes played, with wins, draws, losses and the rating after your last rated game in your main time control
  each day. The first sync takes your latest ~1,500 games (about a minute for heavy players); later syncs take the
  last few days. Closed accounts and unknown names are reported when you connect.
- **Chess.com** reads your monthly game archives: exact minutes from each game's start and end times
  (correspondence games don't count as time), results, and your rating in the time control you play most.

Both sync every hour. The first sync backfills about 90 days, later ones the last 3. Minutes go into the
`chess` tracker (summed with anything you log by hand, like "chess 30"); games, wins and each site's rating
go into `chess.games`, `chess.wins`, `chess.rating-lichess` and `chess.rating-chesscom`, which show on the
Chess card and can be picked in Settings → The System as something to improve.

## Signing in (OAuth)

Strava, Oura, WHOOP, Withings and Google Calendar connect by signing in with the service. ReLife runs on your own
machine, so there is no shared ReLife app: you make a free app with the service once, and the Connect dialog walks you
through it.

1. Open the connector on **Connectors**. Follow the link to the service's developer page and create an app.
2. Copy the **redirect address** the dialog shows (`http://127.0.0.1:3030/api/oauth/<id>/callback` by default) into
   the app. It must match exactly, so open ReLife at the same address you registered (`127.0.0.1` and `localhost` are
   different addresses).
3. Paste the app's client ID and secret and press **Connect**. The service's sign-in page opens; approve it and you
   come back to Connectors, where the first sync starts within a minute.

The tokens are kept encrypted with the connection's keys and refreshed before they expire (WHOOP is asked for `offline` again on each refresh); services that rotate the
refresh token (Strava, Oura, WHOOP, Withings) have the new one saved at once. Disconnect forgets them. A new client ID
means signing in again. If a refresh is refused, the sync fails with "Sign in again on Connectors" and the dialog's
**Sign in again** button fixes it. The sign-in flow is in `src/core/oauth.ts` and `src/app/api/oauth/`; a connector
opts in with an `oauth` spec (`src/core/types.ts`).

## Personal data connectors

Each turns one service into daily numbers. Like every tracker, they join Patterns (links such as "on days you
run you sleep longer"), can be picked in Settings → The System as something to improve, and the System sets and
checks off quests from them. Synced days earn full XP (`src/domain/xp.ts`). Parsing lives in `src/parsers/daily.ts`.

| Connector | Area | Trackers | XP |
|---|---|---|---|
| Strava | Health | `exercise.minutes`, `run.km`, `ride.km`, `hike.km`, `swim.km` | 30 active minutes |
| WakaTime | Skills | `coding.minutes` | An hour of coding |
| Monkeytype | Skills | `typing.minutes`, `typing.wpm` | 5 minutes of typing |
| Duolingo | Skills | `duolingo.xp`, `duolingo.streak` | Any lesson |
| Todoist | Mind | `tasks.done` | 3 tasks done |
| Last.fm | Hobbies | `listening`, `listening.songs` | None: time spent, not practice |
| Steam | Hobbies | `playtime` | None: time spent, not practice |
| Oura | Health | `sleep.hours`, `sleep.score`, `hrv`, `resting.hr` (shared), `oura.readiness`, `oura.steps` | 7 hours of sleep, 8,000 steps |
| WHOOP | Health | `sleep.hours`, `sleep.score`, `hrv`, `resting.hr` (shared), `whoop.recovery`, `whoop.strain` | 7 hours of sleep |
| Withings | Health | `weight`, `body.fat`, `sleep.hours`, `sleep.score` (shared), `withings.steps` | 7 hours of sleep, 8,000 steps |
| Google Calendar | Mind | `meetings.minutes`, `focus.minutes` | An hour of Focus time (half XP: a block is a plan) |
| Toggl Track | Skills | `tracked.minutes` | An hour tracked (one deep-work award a day, see below) |
| RescueTime | Mind | `productivity.pulse`, `productive.minutes`, `distracting.minutes` | Four productive hours (one deep-work award a day) |
| Hevy | Health | `hevy.minutes`, `hevy.workouts`, `hevy.volume` | 30 active minutes (the larger of Hevy and Strava) |
| Readwise | Mind | `highlights.made` | 3 highlights |
| Codewars | Skills | `cp.solved` (source `codewars`), `codewars.honor` | A problem solved |
| Letterboxd | Hobbies | `films.watched` | None: time spent, not practice |
| Open Library | Mind | `books.read` | A finished book (half XP: a shelf is a claim) |
| Anki | Skills | `anki.cards`, `anki.minutes` | 20 cards reviewed |

Sleep, sleep score, HRV and resting heart rate are shared trackers, so a quest on sleep works with whichever device you
wear; each device's value is kept apart (by source) and the one that changed most recently is shown. Steps stay per
device (`steps`, `oura.steps`, `withings.steps`) so two devices never add up; XP takes the highest of the day.

Only synced numbers earn connector XP: a value typed into one of these trackers counts as typed-in (half, capped). One
hour of work seen by several tools pays once: coding time (WakaTime) first, then tracked time (Toggl), then four
productive hours (RescueTime). Focus time blocks and books marked read are what you plan or claim rather than what a
service measured, so they pay half and don't count as verified.

Fitbit is not here: Google shut the Fitbit Web API down on 2 November 2026 and moved it to the Google Health API.
Goodreads is not here either: it switched off its public shelf feeds in late October 2026, so Open Library stands in
(import your Goodreads export at [openlibrary.org/account/import](https://openlibrary.org/account/import)).

Two alerts use them: **Duolingo streak ends tonight** (20:00, when Duolingo says today's lesson isn't done) and **4 days without a
workout** (18:00, once a week, only for people who usually work out 2 or more days a week).

### Strava

Sign in (see [Signing in](#signing-in-oauth)). Create the app at [strava.com/settings/api](https://www.strava.com/settings/api)
and set its **authorization callback domain** to the host of the redirect address, `127.0.0.1` by default (Strava
allows `localhost` too); Strava checks only the
domain, not the whole address.

No browser on this Mac? Paste a refresh token instead: open
`https://www.strava.com/oauth/authorize?client_id=<ID>&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all`,
copy the `code=` from the page it lands on, trade it with
`curl -s -X POST https://www.strava.com/oauth/token -d client_id=<ID> -d client_secret=<SECRET> -d code=<CODE> -d grant_type=authorization_code`
and put its `refresh_token` in the optional field. It is used until you sign in, and pasting a new one replaces the
sign-in. Coming from an older ReLife that took only a pasted token? The newest token it kept is used once, so you stay
connected.

Days follow the local time Strava records for each activity. The first sync backfills 90 days, later ones the last 7.
Active minutes are moving time, every sport.

### Oura

Create an app at [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications) with the redirect
address from the dialog. Scopes asked: `daily`, `heartrate`, `personal`. Each day keeps the night's main sleep (naps
don't count), the sleep and readiness scores, average HRV, lowest heart rate and steps. Oura fills a day once the ring
syncs with its app in the morning. The first sync backfills 90 days, later ones the last 3.

### WHOOP

Create an app at [developer-dashboard.whoop.com](https://developer-dashboard.whoop.com) with the scopes `read:recovery`,
`read:sleep`, `read:cycles` and `offline`. WHOOP accepts only **https** redirect addresses (or app schemes), so open
ReLife over https before you connect, for example through Tailscale Serve or a Cloudflare Tunnel, and register that
address; the dialog shows the right one and warns while you are on plain http. Only scored records count. A night
belongs to the day it ends on, recovery to its night, and strain to the day its cycle starts. Naps are skipped.

### Withings

Create a **Public API integration** at [developer.withings.com](https://developer.withings.com/dashboard/) with the
redirect address from the dialog (http on `localhost` or `127.0.0.1` is fine while the app is in development). Scopes
asked: `user.metrics`, `user.activity`. Weight and body fat come from real weigh-ins only (not goals); the last weigh-in of
the day wins. Sleep needs a Withings watch or sleep mat. The first sync backfills 90 days.

### Google Calendar

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials): turn on the **Google Calendar API**, set up
the OAuth consent screen (External, add yourself as a test user), then create an **OAuth client ID** of type *Web
application* with the redirect address from the dialog. Google allows `http://localhost` addresses; if it refuses
`127.0.0.1`, open ReLife at `http://localhost:3030` and use that address. Scope asked:
`calendar.events.readonly`. Only your primary calendar is read, and only minutes are stored, never titles or guests.
A **meeting** is a timed event with at least one other person that you didn't decline; **Focus time** is Google
Calendar's own Focus time block. All-day events, out-of-office and working-location blocks are skipped, and one event
counts for at most 12 hours. The first sync backfills 60 days, later ones the last 3. In testing mode Google expires the
refresh token after 7 days; publish the app (no review is needed for your own account) to stay signed in.

### WakaTime

Copy the API key from [wakatime.com/settings/account](https://wakatime.com/settings/account). The free plan keeps
14 days, so that is the backfill; later syncs refresh the last 3 days. The day's top language and project are
kept with each day.

### Monkeytype

On monkeytype.com: Account settings → **Ape keys** → Generate, then switch the key on (new keys start off).
Ape keys can read results only a few times a day, so it syncs every 2 hours. Each day keeps the number of tests,
minutes typed, average and best speed and accuracy. The first sync backfills 90 days.

### Duolingo

Your public username, nothing else. Duolingo's public profile gives the total XP and the streak, not XP per day,
so ReLife adds up the gain between syncs: XP per day starts on the day you connect, the streak right away.
XP earned late at night, after the last sync of the day, still goes to that day: Duolingo says which day the
streak was last extended.
Duolingo has no official API; this reads the same address its web app does, and the sync shows an error if it
changes.

### Todoist

Settings → Integrations → Developer → **API token**. Only the number of completed tasks per day (and the name of
the project with the most) is stored, never task names. The first sync backfills 84 days (Todoist allows 3 months
a request). ReLife uses Todoist's v1 API; the older REST v2 and Sync v9 APIs now answer 410 Gone.

### Last.fm

Turn on scrobbling in your music app first (Spotify: Settings → Social → Connect to Last.fm). Then create a free
API account at [last.fm/api/account/create](https://www.last.fm/api/account/create) and paste the API key and your
username. Minutes are estimated at 3.5 per song. The first sync backfills 60 days.

### Steam

Get a key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (domain: `localhost`) and paste
your profile link or 17-digit Steam ID. In Steam → Edit Profile → Privacy, set **Game details** to Public.
Steam only reports lifetime playtime per game, so ReLife adds up each game's gain between syncs: there's no
history before you connect, and playtime appears when a game session ends (a session that ends after the day's
last sync counts on the next day).

### Toggl Track

[track.toggl.com/profile](https://track.toggl.com/profile) → **API Token** (bottom of the page). Only minutes per day,
the number of entries and the project with the most time are stored, never descriptions. A running timer counts once you
stop it. The first sync backfills 85 days, a month per request (Toggl refuses start dates older than about 3 months), later ones the last 3.

### RescueTime

Create an API key at [rescuetime.com/anapi/manage](https://www.rescuetime.com/anapi/manage). ReLife reads the daily
summary feed, which holds the last two weeks and never today, so the first sync backfills 14 days and a day appears the
morning after. Productive minutes are *very productive + productive*; distracting are *distracting + very distracting*.
A day with nothing logged has no pulse.

### Hevy

[hevy.com/settings?developer](https://hevy.com/settings?developer) (the API needs **Hevy Pro**). Each day keeps the
number of workouts, minutes (end minus start) and volume (kg × reps, warm-up sets left out). Minutes go into their own
`hevy.minutes`, not Strava's `exercise.minutes`: Hevy can post each workout to Strava too, so adding them would count a
session twice. XP and the workout-gap alert take the larger of the two each day. First sync backfills 90 days.

### Readwise

[readwise.io/access_token](https://readwise.io/access_token). Counts highlights by the time you made them, with the number
of different books or articles; highlight text is never stored. Highlights with no highlight time are skipped. 90-day
backfill, later syncs the last 3.

### Codewars

Your public username, no key. A kata counts once, on the local day you first completed it, and adds to `cp.solved`
(source `codewars`). Honor is the current total, set on today, since Codewars keeps no history. 90-day backfill.

### Letterboxd

Your public username or profile link. ReLife reads your diary from `letterboxd.com/<you>/rss/`, which holds only your
latest 50 diary entries: the first sync takes whatever is there, and older films are never seen. Each day keeps the
films watched, their titles and the average rating you gave. Lists and reviews without a watched date are skipped.

### Open Library

Your username (`openlibrary.org/people/<name>`), with the reading log set to public in Open Library's settings. Books
count on the day you mark them **Already Read**, so a bulk import lands on one day. Coming from Goodreads? Export your
library there and import it at [openlibrary.org/account/import](https://openlibrary.org/account/import). The first sync
backfills 365 days.

### Anki

Install the **AnkiConnect** add-on in Anki (Tools → Add-ons → Get Add-ons → `2055492159`) and keep Anki open. No key is
needed unless you set an `apiKey` in the add-on's config; the address defaults to `http://127.0.0.1:8765`. Cards are the
answers you gave each local day (learn, review, relearn and filtered decks); "Set due date" and reschedule entries are
left out. Minutes add up each answer's time, which Anki caps at 60 seconds. If the review log can't be read, Anki's own
daily count stands in, without minutes. When Anki is closed the sync says so, and the next one catches up. 90-day backfill.

## Binance

Create a **read-only** key:

1. Binance → Profile → **API Management** → Create API → System generated.
2. Tick **only "Enable Reading"**. Leave trading, margin, futures, withdrawals and transfers off.
3. Under IP access restrictions choose **Restrict access to trusted IPs only** and add your
   public IP (`curl ifconfig.me`). If your IP changes often, you can leave it unrestricted, but a
   read-only key is the minimum.
4. Put the key and secret in `.env` as `BINANCE_API_KEY` and `BINANCE_API_SECRET`.

Connect tests the key before saving it: a wrong key, an IP that isn't on the key's trusted list, or a key that can
trade, withdraw or transfer is refused with advice. Every sync checks the permissions again.

What it syncs:

- **Balances** every hour, Spot plus the Funding wallet (where P2P buys land), valued in USD
  through each asset's USDT price. Simple Earn assets (`LDBTC`) are priced as the underlying coin.
  Portfolio hides balances worth under $1.
- **Spot trades** on every pair you ever traded (first sync), then new trades for those pairs and for
  every asset you hold, against the quotes in `BINANCE_QUOTES`
  (default `USDT,FDUSD,USDC`). Add other pairs you traded but no longer hold to `BINANCE_SYMBOLS`,
  for example `BINANCE_SYMBOLS=SOL/BTC,DOGE/USDT`.
- **P2P orders** (INR on-ramp and off-ramp), completed orders only, as far back as Binance keeps them.
- **Convert** history. Convert, deposits, withdrawals and P2P are read in time windows; a window that comes back
  full is split, so nothing past the API's row limit is dropped.
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

## Shopping and travel apps (Swiggy, Zomato, Blinkit, Zepto, Flipkart, Amazon, MakeMyTrip)

These apps have no public API, so ReLife reads your own order history the way you would: in Chrome,
logged in as you. Personal use only, and not an official integration.

1. On Connectors, open the app and press **Open login window**. A plain Chrome window opens (not
   remote-controlled, so sites' bot checks let the login through).
2. Log in (phone OTP included).
3. Once you see your account, press **Connect**: ReLife closes the window and keeps the login. Every 6 hours the worker opens the order-history page in a hidden window with the
   saved session, reads the order data the page loads, and falls back to your AI model reading the page
   text when that data isn't recognised.

- Sessions live in `data/browser/<app>` (git-ignored). Delete that folder to forget a login.
- Uses your installed Google Chrome (found automatically on macOS and in the usual Linux places); set `CHROME_PATH`
  in `.env` if it's somewhere else. Connect says so when Chrome is missing.
- Each order becomes one transaction on the app's own account, with its items and order id. The order id
  keeps it from being counted twice when the order is read again.
- Cancelled and failed orders are skipped.
- MakeMyTrip reads your bookings from My Trips (`supportz.makemytrip.com/Mima/BookingSummary/`). Each booking
  counts on the day you paid for it, under Travel; cancelled trips are skipped.
- If an app moves its order page, paste the new address into the Connect dialog's *Order history page*.
  The Zomato, Blinkit and Zepto addresses are best guesses until confirmed on a real account.
- Logged out (sessions expire every few weeks): the connector shows "Logged out of …"; log in again.
- Risks: automated access may go against an app's terms, and it breaks when the site changes.

## Adding a connector

1. Create `src/connectors/<id>.ts` exporting a `Connector` (`id`, `name`, `category`, `description`,
   `provides`, `fields`, `env`, `everyMinutes`, `sync`). `fields` are the inputs of its Connect dialog on
   /connectors; each names the env var the connector reads. In `sync`, call `ctx.emit()` with a stable `externalId` per event and
   save progress with `ctx.setCursor()`. Add a `check(get)` that makes one cheap request with the values being
   saved (`get('<ENV>')`, not `env()`) and throws advice when the key or username is wrong.
2. Add it to the list in `src/connectors/index.ts`.
3. Write a parser in `src/parsers/` that matches its `source`, add it to `src/parsers/index.ts`
   (before `llmFallback`), and add a fixture in `src/parsers/fixtures/`. A source that sends one summary per day
   can use the helpers in `src/connectors/daily.ts` and add an entry to `DAYS` in `src/parsers/daily.ts` instead.
   A service that only reports a lifetime total (like Duolingo XP) can turn it into a daily amount with
   `todayFromTotal` from `src/domain/running-total.ts`.
4. Document its env vars here and in `.env.example`.
