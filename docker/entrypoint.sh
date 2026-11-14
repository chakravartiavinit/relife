#!/bin/sh
# The one command of the image: `relife <web|worker|migrate|signin|backup|restore|import|demo>`. Compose passes the environment
# (there is no .env file in the image), so none of these read one.
set -e
cd /app/apps/web

cmd="${1:-web}"
[ "$#" -gt 0 ] && shift

case "$cmd" in
  web)
    # The first time (no device signed in yet) this prints the sign-in code into the log. It never stops the server.
    tsx scripts/signin.ts --first-run || echo "[relife] could not print the first sign-in code; run: docker compose exec web relife signin" >&2
    exec next start -H "$RELIFE_BIND" -p "$PORT"
    ;;
  worker)
    exec tsx src/worker/index.ts
    ;;
  migrate)
    exec tsx scripts/migrate.ts
    ;;
  signin)
    exec tsx scripts/signin.ts "$@"
    ;;
  backup|restore|import)
    # Backups go to /backups (RELIFE_BACKUP_DIR). restore and import need the app stopped / an empty database: docs/SELF_HOSTING.md.
    exec tsx "scripts/$cmd.ts" "$@"
    ;;
  demo)
    # The read-only demo: sample data in a throwaway database, refreshed every day so the dates stay current.
    # Seeding writes, so it runs without RELIFE_DEMO; the server then runs with it.
    seed="${RELIFE_DEMO_SEED:-42}"
    env -u RELIFE_DEMO RELIFE_MOCK=1 RELIFE_MOCK_ONBOARDED=1 tsx scripts/mock.ts "$seed"
    (
      while sleep 86400; do
        env -u RELIFE_DEMO RELIFE_MOCK=1 RELIFE_MOCK_ONBOARDED=1 tsx scripts/mock.ts "$seed" || echo "[relife] demo reseed failed" >&2
      done
    ) &
    RELIFE_DEMO=1 RELIFE_MOCK=1 tsx scripts/demo-check.ts
    RELIFE_DEMO=1 RELIFE_MOCK=1 exec next start -H "$RELIFE_BIND" -p "$PORT"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
