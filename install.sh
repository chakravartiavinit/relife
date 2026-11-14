#!/bin/sh
# Installs the app with Docker: clones the repo, writes .env, starts it, prints your first sign-in code.
#   curl -fsSL https://raw.githubusercontent.com/chakravartiavinit/relife/main/install.sh | sh
# Environment: RELIFE_DIR (default ~/relife), RELIFE_REPO, RELIFE_LOCAL_AI_MODEL. Never overwrites an existing .env.
#
# Everything runs inside main(), called on the last line: if the download stops halfway, the shell has not seen that
# line and runs nothing.
set -eu

REPO="${RELIFE_REPO:-https://github.com/chakravartiavinit/relife}"
DIR="${RELIFE_DIR:-$HOME/relife}"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# The app's services are in the `app` profile. Always asking for it keeps an existing .env without
# COMPOSE_PROFILES=app from waiting for a web service that was never started.
dc() { docker compose --profile app "$@"; }

check_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Get it from https://docs.docker.com/get-docker/ and run this again."
  command -v git >/dev/null 2>&1 || die "git is not installed."
  compose_version=$(docker compose version --short 2>/dev/null) || die "Docker Compose is missing. Install Docker Compose 2.24 or newer."
  major=${compose_version#v}; major=${major%%.*}
  minor=${compose_version#v*.}; minor=${minor%%.*}
  if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 24 ]; }; then
    die "Docker Compose $compose_version is too old. Install 2.24 or newer."
  fi
}

# Questions go through the terminal, so this works when the script itself comes from a pipe. With no terminal
# (a CI job, `docker exec` without -t) every question takes its default.
ask() { # ask "question" default -> answer
  if ( : </dev/tty ) 2>/dev/null; then
    printf '%s [%s] ' "$1" "$2" >/dev/tty
    read -r answer </dev/tty || answer=""
  else
    answer=""
  fi
  printf '%s' "${answer:-$2}"
}

write_env() {
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
  if [ "$ai" = y ] || [ "$ai" = Y ]; then profiles="app,ai"; fi
  model="${RELIFE_LOCAL_AI_MODEL:-qwen3:4b-instruct}"
  {
    echo "COMPOSE_PROFILES=$profiles"
    echo "POSTGRES_PASSWORD=$password"
    if [ -n "$timezone" ]; then echo "RELIFE_TIMEZONE=$timezone"; fi
    echo "RELIFE_LISTEN=$listen"
    if [ -n "$hosts" ]; then echo "RELIFE_ALLOWED_HOSTS=$hosts"; fi
    if [ -n "$public" ]; then echo "RELIFE_PUBLIC_URL=$public"; fi
    case "$profiles" in *ai*) echo "RELIFE_LOCAL_AI_MODEL=$model"; echo "LLM_DEFAULT=local:$model" ;; esac
  } > .env
  chmod 600 .env
  say "Wrote $DIR/.env"
}

main() {
  check_docker

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
    write_env
  fi

  say "Building and starting (the first build takes a few minutes)..."
  dc up -d --build

  say "Waiting for the web app..."
  waited=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q web)" 2>/dev/null)" = healthy ]; do
    waited=$((waited + 3))
    [ "$waited" -le 300 ] || die "The web app did not become healthy in 5 minutes. See: docker compose --profile app logs web"
    sleep 3
  done

  say ""
  # -T: no terminal is attached under `curl | sh`; </dev/null keeps the command from reading the rest of this script.
  dc exec -T web relife signin </dev/null
  say "It is running. Open http://127.0.0.1:3030 (or the address you chose) and go to /pair."
  say "More: $DIR/docs/SELF_HOSTING.md"
}

main "$@"
