#!/bin/sh
# Installs the app with Docker: clones the repo, writes .env, starts it, prints your first sign-in code.
#   curl -fsSL https://raw.githubusercontent.com/chakravartiavinit/relife/main/install.sh | sh
# Environment: RELIFE_DIR (default ~/relife), RELIFE_REPO. Never overwrites an existing .env.
set -eu

REPO="${RELIFE_REPO:-https://github.com/chakravartiavinit/relife}"
DIR="${RELIFE_DIR:-$HOME/relife}"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed. Get it from https://docs.docker.com/get-docker/ and run this again."
command -v git >/dev/null 2>&1 || die "git is not installed."
compose_version=$(docker compose version --short 2>/dev/null) || die "Docker Compose is missing. Install Docker Compose 2.24 or newer."
major=${compose_version#v}; major=${major%%.*}
minor=${compose_version#v*.}; minor=${minor%%.*}
if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 24 ]; }; then
  die "Docker Compose $compose_version is too old. Install 2.24 or newer."
fi

# Questions go through the terminal, so this works when the script itself comes from a pipe. With no terminal
# (a CI job, `docker exec` without -t) every question takes its default.
if ( : </dev/tty ) 2>/dev/null; then have_tty=1; else have_tty=0; fi
ask() { # ask "question" default -> answer
  if [ "$have_tty" = 1 ]; then
    printf '%s [%s] ' "$1" "$2" >/dev/tty
    read -r answer </dev/tty || answer=""
  else
    answer=""
  fi
  printf '%s' "${answer:-$2}"
}

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only
else
  say "Cloning into $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

if [ -f .env ]; then
  say ".env already exists: leaving it as it is."
else
  password=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  timezone=""
  if [ -r /etc/timezone ]; then timezone=$(cat /etc/timezone); fi
  if [ -z "$timezone" ] && [ -L /etc/localtime ]; then timezone=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||'); fi

  say ""
  say "Where will you open it?"
  say "  1) On this computer only (localhost)"
  say "  2) Over Tailscale (recommended for your phone: run 'tailscale serve --bg 3030' afterwards)"
  say "  3) On my home network (a LAN address)"
  say "  4) On a domain behind a reverse proxy with HTTPS"
  choice=$(ask "Choose 1-4" 1)
  listen="127.0.0.1"; hosts=""; public=""
  case "$choice" in
    3)
      host=$(ask "The address you will type in the browser, e.g. 192.168.1.20" "")
      listen="0.0.0.0"; hosts="$host"; [ -n "$host" ] && public="http://$host:3030" ;;
    4)
      host=$(ask "Your domain, e.g. relife.example.com" "")
      hosts="$host"; [ -n "$host" ] && public="https://$host" ;;
  esac
  ai=$(ask "Use free local AI (downloads about 2.5 GB, needs about 4 GB of RAM)? y/N" n)

  profiles="app"
  [ "$ai" = y ] || [ "$ai" = Y ] && profiles="app,ai"
  {
    echo "COMPOSE_PROFILES=$profiles"
    echo "POSTGRES_PASSWORD=$password"
    [ -n "$timezone" ] && echo "RELIFE_TIMEZONE=$timezone"
    echo "RELIFE_LISTEN=$listen"
    [ -n "$hosts" ] && echo "RELIFE_ALLOWED_HOSTS=$hosts"
    [ -n "$public" ] && echo "RELIFE_PUBLIC_URL=$public"
    case "$profiles" in *ai*) echo "LLM_DEFAULT=local:qwen3:4b-instruct" ;; esac
  } > .env
  chmod 600 .env
  say "Wrote $DIR/.env"
fi

say "Building and starting (the first build takes a few minutes)..."
docker compose up -d --build

say "Waiting for the web app..."
waited=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null)" = healthy ]; do
  waited=$((waited + 3))
  [ "$waited" -le 300 ] || die "The web app did not become healthy in 5 minutes. See: docker compose logs web"
  sleep 3
done

say ""
docker compose exec web relife signin
say "It is running. Open http://127.0.0.1:3030 (or the address you chose) and go to /pair."
say "More: $DIR/docs/SELF_HOSTING.md"
