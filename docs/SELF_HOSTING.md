# Self-hosting ReLife with Docker

The one guide for running ReLife on a computer or server you own, on Linux, Windows or macOS. For working on the
code, see the README ("From source").

## What you need

- Docker with Compose 2.24 or newer.
- 2 GB of RAM, plus about 4 GB more if you turn on the free local AI model.
- About 2 GB of disk for the image, and 3 GB more for the AI model.

## Install

**With the script** (it asks where you will open ReLife and whether you want local AI):

```bash
curl -fsSL https://raw.githubusercontent.com/chakravartiavinit/relife/main/install.sh | sh
```

It clones into `~/relife` (set `RELIFE_DIR` to change that), writes `.env` if there is none, builds the image,
starts everything and prints your first sign-in code. It never overwrites an existing `.env`.

**By hand:**

```bash
git clone https://github.com/chakravartiavinit/relife && cd relife
printf 'COMPOSE_PROFILES=app\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 16)" > .env
docker compose up -d --build
```

The image is built on your machine from the source; nothing is downloaded from a registry except the base images.
`COMPOSE_PROFILES=app` in `.env` is what turns the app on: without it, `docker compose up -d` starts only Postgres
(that is the development setup).

Four services run:

| Service | What it does |
|---|---|
| `postgres` | The database, with its data in the `relife-pg` volume. |
| `migrate` | Runs once at every start: applies the database migrations and creates the encryption key. |
| `web` | The dashboard, on port 3030 of this computer. Restarts by itself. |
| `worker` | Syncs, reminders, nudges, the Telegram bot and the job engine. Restarts by itself. |

Docker brings them back after a crash. To bring them back after a reboot, start Docker at boot
(`sudo systemctl enable docker` on Linux, "Start Docker Desktop when you sign in" on Windows and macOS).

## First sign-in

Nobody is signed in yet, so `web` prints a code in its log the first time:

```bash
docker compose logs web
```

```
────────────────────────────────────────────────────────────────
  First sign-in: open ReLife, go to /pair and type ABCD-EFGH (valid 10 minutes).
  Expired? Run: docker compose exec web relife signin
────────────────────────────────────────────────────────────────
```

Open ReLife, go to `/pair`, type the code. Every new browser or phone after that is added from Settings → Devices
(see [Phone access in the README](../README.md#phone-access)). To get a new code, or to get back in after you
signed out everywhere:

```bash
docker compose exec web relife signin
```

In Docker ReLife never trusts "this computer" without a code: requests reach the container through Docker, so every
browser pairs once.

## Moving from a source checkout (or the Mac service) to Docker

You can keep your data. Both setups use the same database format and the same key file.

1. **Stop the old one first.** `npm run service -- stop` (macOS service) and stop `npm run dev`. Two copies of the
   app on one database, or on port 3030, is a recipe for trouble.
2. **The database.** The Postgres from the README's source setup (`docker compose up -d`, volume `relife-pg`) is the
   same service the `app` profile uses, so from the same checkout folder there is nothing to move: `migrate` recognises
   the tables `npm run db:push` made and carries on. Its password is `relife`, so leave `POSTGRES_PASSWORD` unset (or set
   it to `relife`); a new random one would not match the existing volume. A database somewhere else: `pg_dump` it and
   restore into the new one (`docker compose exec -T postgres psql -U relife relife < relife.sql`, before the `app`
   profile starts).
3. **The key.** Your saved connector keys are encrypted with `data/secret.key`. Without that file ReLife refuses to
   make a new one and the saved keys read as missing. Copy it into the `relife-data` volume **before** the first start:

   ```bash
   docker compose --profile app create web            # creates the relife-data volume
   docker compose cp data/secret.key web:/data/secret.key
   ```

   (If you used `RELIFE_SECRET_KEY` in `.env`, keep it there: it is passed to the containers.) The Chrome profiles for the
   shopping apps in `data/browser/` do not move: those connectors don't run in Docker.
4. `docker compose up -d --build`, then `docker compose exec web relife signin` for a first sign-in code. Devices
   paired before are in the database and keep working if you carried it over, on the same address.

## Opening it from your phone or another computer

ReLife listens on `127.0.0.1:3030` only, so nothing on your network can reach it until you decide. It also refuses
any address it was not told about (a DNS-rebinding guard); the refusal page is HTTP 421.

**Tailscale (recommended).** Install Tailscale on the host and your phone, then on the host:

```bash
tailscale serve --bg 3030
```

Open `https://<machine>.<tailnet>.ts.net`. `*.ts.net` names work with no settings. Only your own devices reach it.
This is also what notifications and the Android app need: browser push only works on an HTTPS address, and
You › Settings › Devices › Use on your phone shows the QR for it (see [PHONE.md](PHONE.md)). The plain `http://` LAN address
opens the web app but cannot receive notifications. The Android app accepts `http://` only for a private address (LAN,
Tailscale), asking first; any public name must be `https://`.

**A domain behind a reverse proxy, with HTTPS.** Point the proxy at `127.0.0.1:3030` and tell ReLife the name:

```
# .env
RELIFE_ALLOWED_HOSTS=relife.example.com
RELIFE_PUBLIC_URL=https://relife.example.com
```

```
# Caddyfile
relife.example.com {
    reverse_proxy 127.0.0.1:3030
}
```

Run `docker compose up -d` again after editing `.env`. Never make the proxy rewrite `Host` to `localhost`.

**Your home network (LAN).** Set `RELIFE_LISTEN=0.0.0.0` and `RELIFE_ALLOWED_HOSTS=192.168.1.20` (the address you
type in the browser), then `docker compose up -d`. This is plain HTTP, so keep it to a network you trust.

## Settings (`.env`)

Compose reads `.env` for itself, and passes it on to the containers, so connector keys such as `GITHUB_TOKEN` work too
(you can also type them in You → Connections, which stores them encrypted).

| Variable | Default | What it does |
|---|---|---|
| `COMPOSE_PROFILES` | none | `app` runs ReLife, `ai` adds the local model (`app,ai`), `demo` the read-only demo. |
| `POSTGRES_PASSWORD` | `relife` | The database password. Set it before the first start; changing it later needs the database user changed too. |
| `RELIFE_LISTEN` | `127.0.0.1` | Which address the web port is published on. `0.0.0.0` is your whole network. |
| `RELIFE_PORT` | `3030` | The port on the host. |
| `RELIFE_ALLOWED_HOSTS` | empty | Names or addresses ReLife may be opened on, besides localhost and `*.ts.net`. `*.example.com` matches subdomains. |
| `RELIFE_PUBLIC_URL` | empty | The address a phone should open (sign-in links, QR codes, Telegram buttons). |
| `RELIFE_VAPID_PUBLIC_KEY`, `RELIFE_VAPID_PRIVATE_KEY` | empty | Keys for browser notifications. Empty: ReLife makes `/data/vapid.json` on first use. Set them to keep notifications working when you move to a new machine. |
| `RELIFE_TIMEZONE`, `RELIFE_BASE_CURRENCY`, `RELIFE_USER_NAME` | `Asia/Kolkata`, `INR`, `Me` | Used once, when the first user is created. |
| `RELIFE_LOCAL_AI_MODEL` | `qwen3:4b-instruct` | The model the `ai` profile downloads. |
| `LLM_DEFAULT` | empty | The model ReLife uses, `provider:model` (`local:qwen3:4b-instruct`, `anthropic:...`). |
| `RELIFE_IMAGE` | `relife:local` | The name given to the image you build. |
| `RELIFE_PG_PORT` | `5442` | The host port of Postgres (`127.0.0.1` only). |

Set inside the containers by `docker-compose.yml` (a value in `.env` for these is ignored): `NODE_ENV=production`,
`DATABASE_URL`, `RELIFE_DATA_DIR=/data`, `RELIFE_BACKUP_DIR=/backups`, `RELIFE_BIND=0.0.0.0`,
`RELIFE_CONTAINER=1`.

## Free local AI

```bash
# .env
COMPOSE_PROFILES=app,ai
LLM_DEFAULT=local:qwen3:4b-instruct
```

`docker compose up -d` then starts `ollama` (the model server) and `ollama-pull`, which downloads the model once
(about 2.5 GB) into the `relife-ollama` volume. Nothing leaves your machine. `/api/health` (from the host:
`docker compose exec web node -e "fetch('http://127.0.0.1:3030/api/health').then(r=>r.json()).then(console.log)"`)
shows `localAi`, and when the server is down it says so. To use another model, set `RELIFE_LOCAL_AI_MODEL` and
`LLM_DEFAULT=local:<that model>`.

## What does not work in Docker

- **Shopping apps** (Swiggy, Zomato, Blinkit, Zepto, Flipkart, Amazon, MakeMyTrip). They sign in through Chrome on your
  own computer. The Connections page shows them greyed out with that reason. Run ReLife on your Mac or PC to use them.
- **Mac activity** (the app in front). It reads the Mac's windows; use the Chrome extension for browser time.
- **The iCloud inbox** unless you mount the folder. Add `./inbox:/inbox:ro` under `volumes:` of `web` and `worker`
  (in a `docker-compose.override.yml`) and set `ICLOUD_INBOX_PATH=/inbox/inbox.txt` in `.env`.

## Upgrade, logs, stop

```bash
git pull && docker compose up -d --build     # upgrade: the migrations run by themselves
docker compose logs -f web worker            # logs
docker compose ps                            # state
docker compose stop                          # stop (data stays)
```

Old databases are safe: `migrate` applies only the migrations that are missing. A database made by `npm run db:push`
(from a source checkout) is recognised and adopted.

## Troubleshooting

- **"ReLife refused this address" (421).** You opened it on a name or address that is not allowed. Add it to
  `RELIFE_ALLOWED_HOSTS` in `.env`, then `docker compose up -d`.
- **The sign-in code expired.** `docker compose exec web relife signin`.
- **`migrate` failed with "does not match this version ... no migration history".** The database was made by
  `npm run db:push` of a different version, or edited by hand. In a source checkout run `npm run db:push` once against it
  (answer the questions it asks), then start again.
- **`migrate` or `web` says saved keys exist but `secret.key` is missing.** The `relife-data` volume was lost or
  replaced. Restore it from a backup; ReLife will not make a new key, which would make every saved key unreadable.
- **The local AI is unreachable.** Check `docker compose --profile ai ps`; the first start downloads the model, which
  takes a while. `docker compose logs ollama-pull` shows progress.
- **Port in use.** Set `RELIFE_PORT` (and `RELIFE_PG_PORT` for Postgres) in `.env`.

## Backups

ReLife writes a backup every night at 03:30 (the worker does it) and keeps the last 7, plus the newest of each of the 4
weeks before them. Each backup is one `.tar.gz` in the `relife-backups` volume (`/backups`, `RELIFE_BACKUP_DIR`): the
database (`pg_dump`, PostgreSQL 16 client tools are in the image) plus `secret.key`, `vapid.json` (the push keys) and the library pictures. It is
exact, so it holds the key that opens your saved connector keys. Set `RELIFE_BACKUP_PASSPHRASE` in `.env` to encrypt
every backup (AES-256-GCM; a lost passphrase is a lost backup). `RELIFE_BACKUP_KEEP` changes how many are kept (`0`
turns backups off).

```bash
docker compose exec worker relife backup            # a backup now (or Settings → Data & privacy → Back up now)
docker compose cp worker:/backups/. ./my-backups/   # copy them off this machine: a volume on the same disk is not a backup
docker compose run --rm worker relife restore       # lists the backups
```

**The volume is not off-site.** If the disk dies, the backups die with it. Copy the folder somewhere else now and then, or
bind-mount a folder you already back up: in a `docker-compose.override.yml` add `volumes: ["/path/to/backups:/backups"]`
under `migrate`, `web` and `worker` (it replaces the `/backups` mount and keeps `/data`).

**Restore** replaces the database with the backup. Stop the app first; the worker counts as running for 3 minutes after
its last check-in, so wait that long after stopping it:

```bash
docker compose stop web worker
docker compose run --rm --no-deps web relife restore /backups/relife-backup-2026-11-13T033005.tar.gz
docker compose up -d
```

It asks you to type `RESTORE relife`, takes a `pre-restore` safety backup of what is there first, restores in one
transaction (a failure leaves the old data), and puts the backup's `secret.key` and `vapid.json` in `/data` (a different existing key is kept as
`secret.key.replaced-<time>`). `--yes` skips the question; `--force` restores even though the saved keys in the backup
would not open with the key in effect (they then read as not saved). To move to a new install, start it first
(the migrations run by themselves), stop `web` and `worker`, then restore into it. `relife import <relife-export.zip>` loads an export (Settings → Data &
privacy → Export) into an **empty** install instead; an export has no keys, so connect your sources again.

The in-app **Export** is a ZIP of readable JSON and CSV for you to keep or move to other tools. It never contains saved
keys. A backup is for restoring ReLife; an export is for leaving it or looking inside.

## Coolify and Unraid

- **Coolify:** create a "Docker Compose" resource from this repository and set the variables above in its environment
  tab (at least `COMPOSE_PROFILES=app`, `POSTGRES_PASSWORD`, `RELIFE_ALLOWED_HOSTS`, `RELIFE_PUBLIC_URL`). Let Coolify's
  proxy serve the domain; point it at the `web` service, port 3030.
- **Unraid:** install the Compose Manager plugin, add a stack with this repository's `docker-compose.yml` and a `.env`,
  and set `RELIFE_LISTEN=0.0.0.0` with `RELIFE_ALLOWED_HOSTS` set to the server's address.

## The read-only demo

```bash
docker compose --profile demo up -d --build demo
```

serves sample data on http://127.0.0.1:3001 (`RELIFE_DEMO_PORT`, `RELIFE_DEMO_LISTEN`, and
`RELIFE_DEMO_HOSTS` for the host names it may answer to). Nothing a visitor does is saved: every write is refused and
the page shows "Demo: changes are off". It has its own throwaway database (`demo-db`, memory only, seeded again every
24 hours so the dates stay current), no keys, no worker and no AI. To show it publicly, put a reverse proxy with HTTPS in
front and limit connections per visitor: each open page keeps one live-update stream. It is for local builds only until
the project name and logo are final (`publicReady` in `packages/brand/brand.json`).

## Uninstall

```bash
docker compose down            # stops and removes the containers, keeps your data
docker compose down -v         # also deletes every volume: your database, key and models. Cannot be undone.
```
