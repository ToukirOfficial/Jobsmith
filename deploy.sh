#!/usr/bin/env bash
# Deploys Jobsmith (Next.js web, NestJS API, BullMQ worker under PM2) to your server over SSH.
# The release is built ON the server from a clean clone of the pushed HEAD on GitHub, so native packages
# (argon2, sharp, Prisma engines) match the server's CPU (e.g. ARM). Works from macOS and Linux/WSL:
# locally it only needs git and ssh.
#   ./deploy.sh          build the pushed HEAD on the server, dump + migrate if needed, switch, check
#   ./deploy.sh --check  show uncommitted files, pending migrations and the live release; changes nothing
#   ./deploy.sh --seed   also run the seed on the server after switching (allowed only when DEMO_MODE=true there)
#
# Nothing about the server is committed: every value comes from ./deploy.env (gitignored; copy
# deploy.env.example). Before the first deploy, create on the server:
#   $APP_DIR/shared/api.env   the API's production .env (DATABASE_URL, REDIS_URL, secrets, API_PORT, ...)
#   $APP_DIR/shared/web.env   APP_URL and API_INTERNAL_URL=http://127.0.0.1:$API_PORT
# and point the nginx vhost at 127.0.0.1:$WEB_PORT (with proxy_buffering off for /api/v1/agent-runs/).
# The server needs git, Node 24, pnpm, PM2, psql and pg_dump for SITE_USER.
set -euo pipefail
cd "$(dirname "$0")"

[[ -f deploy.env ]] || { echo "Missing deploy.env. Copy deploy.env.example to deploy.env and fill it in." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./deploy.env
set +a
for v in HOST SITE_USER APP_DIR BACKUPS_DIR DB_NAME URL WEB_PORT API_PORT PM2_PREFIX; do
  [[ -n "${!v:-}" ]] || { echo "Set $v in deploy.env (see deploy.env.example)." >&2; exit 1; }
done
API_INTERNAL="http://127.0.0.1:$API_PORT"
BRANCH=${BRANCH:-main}
# Public clone URL of this repo (the server needs no GitHub key).
REPO_URL=${REPO_URL:-$(git remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#')}

MODE=deploy; SEED=0
for a in "$@"; do
  case "$a" in
    --check) MODE=check ;;
    --seed) SEED=1 ;;
    *) echo "Unknown option: $a" >&2; exit 1 ;;
  esac
done

# Node: nvm first (WSL/Linux and Mac), Homebrew only as a fallback. Only git and ssh are used locally.
export NVM_DIR="$HOME/.nvm"
set +u
for f in "$NVM_DIR/nvm.sh" /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh; do
  [[ -s "$f" ]] && { . "$f"; break; }
done
nvm use -s 24 >/dev/null 2>&1 || nvm use -s default >/dev/null 2>&1 || true
set -u

# Runs a script from stdin on the server as SITE_USER, passing the remaining arguments to it.
as_site() {
  local cmd
  cmd="bash -s -- $(printf '%q ' "$@")"
  ssh "$HOST" "if [ \"\$(id -un)\" = $(printf %q "$SITE_USER") ]; then $cmd; else sudo -iu $(printf %q "$SITE_USER") $cmd; fi"
}

SHA=$(git rev-parse HEAD)
RUN="git-${SHA:0:7}"
DIRTY=$(git status --porcelain)
git fetch -q origin "$BRANCH"
PUSHED=1; [[ "$SHA" == "$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)" ]] || PUSHED=0
APPLIED=$(as_site "$APP_DIR" <<'Q' || true
U=$(grep -E '^DATABASE_URL=' "$1/shared/api.env" 2>/dev/null | cut -d= -f2-)
[ -n "$U" ] && psql "$U" -Atc 'select migration_name from _prisma_migrations where finished_at is not null' 2>/dev/null || true
Q
)
PENDING=$(comm -23 <(git ls-tree --name-only "$SHA" apps/api/prisma/migrations/ | xargs -n1 basename | grep -E '^[0-9]' | sort) <(echo "$APPLIED" | sort))
LIVE_RUN=$(ssh "$HOST" "basename \$(readlink $APP_DIR/current 2>/dev/null) 2>/dev/null || true")

if [[ "$MODE" == check ]]; then
  echo "== Uncommitted files =="; echo "${DIRTY:-(none)}"
  echo "== Pushed to origin/$BRANCH: $([[ $PUSHED -eq 1 ]] && echo yes || echo 'no, push first')"
  echo "== Pending migrations =="; echo "${PENDING:-(none)}"
  echo "== Live: ${LIVE_RUN:-(none)}, would deploy: $RUN"
  exit 0
fi
[[ -z "$DIRTY" ]] || { echo "Uncommitted changes; commit them first:" >&2; echo "$DIRTY" >&2; exit 1; }
[[ $PUSHED -eq 1 ]] || { echo "HEAD is not origin/$BRANCH; push first (the server clones from GitHub)." >&2; exit 1; }
ssh "$HOST" "test -f $APP_DIR/shared/api.env && test -f $APP_DIR/shared/web.env" || { echo "Create $APP_DIR/shared/api.env and web.env on the server first (see the top of deploy.sh)." >&2; exit 1; }

echo "== Building $RUN on the server${PENDING:+, migrating}, switching =="
as_site "$APP_DIR" "$BACKUPS_DIR" "$DB_NAME" "$RUN" "$LIVE_RUN" "$REPO_URL" "$BRANCH" "$SHA" "$API_INTERNAL" "$URL" \
  "$WEB_PORT" "$API_PORT" "$PM2_PREFIX" "$SEED" "${PENDING:+1}" <<'REMOTE'
set -euo pipefail
APP_DIR=$1 BACKUPS_DIR=$2 DB_NAME=$3 RUN=$4 LIVE_RUN=$5 REPO_URL=$6 BRANCH=$7 SHA=$8 API_INTERNAL=$9
URL=${10} WEB_PORT=${11} API_PORT=${12} PM2_PREFIX=${13} SEED=${14} MIGRATE=${15}
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null
REL="$APP_DIR/releases/$RUN"
B="$APP_DIR/build-src"
pm2_start() {
  cd "$APP_DIR/current"
  for p in api worker web; do pm2 delete "$PM2_PREFIX-$p" >/dev/null 2>&1 || true; done
  PM2_PREFIX=$PM2_PREFIX WEB_PORT=$WEB_PORT API_PORT=$API_PORT pm2 start ecosystem.config.cjs >/dev/null && pm2 save >/dev/null
}
switch() { ln -sfn "$APP_DIR/releases/$1" "$APP_DIR/current.new" && mv -T "$APP_DIR/current.new" "$APP_DIR/current"; }

if [[ "$RUN" != "$LIVE_RUN" ]]; then
  trap 'rm -rf "$B"' EXIT
  rm -rf "$B"
  git clone -q --branch "$BRANCH" "$REPO_URL" "$B"
  git -C "$B" checkout -q "$SHA"
  cd "$B"
  export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  pnpm install --frozen-lockfile >/dev/null
  [[ ! -e .env && ! -e apps/web/.env && ! -e apps/api/.env ]] || { echo "A .env file is in the build clone; refusing." >&2; exit 1; }
  # Production values only: a clean environment, not this shell's. prisma generate never connects.
  env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production API_INTERNAL_URL="$API_INTERNAL" APP_URL="$URL" NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm build >/dev/null
  # The /api rewrite is fixed at build time: it must point at the server's API, never a local port.
  node -e 'const m=require("./apps/web/.next/routes-manifest.json"); const r=[].concat(m.rewrites.beforeFiles||[],m.rewrites.afterFiles||[],m.rewrites.fallback||[],Array.isArray(m.rewrites)?m.rewrites:[]); const d=r.find((x)=>x.source==="/api/:path*"); if(!d||d.destination!==process.argv[1]+"/api/:path*"){console.error("Build check failed: /api rewrite is "+(d&&d.destination));process.exit(1)}' "$API_INTERNAL"
  echo "   bundling release $RUN"
  rm -rf "$REL"
  mkdir -p "$REL/web/apps/web/.next" "$REL/web/apps/web/public"
  cp -a apps/web/.next/standalone/. "$REL/web/"
  cp -a apps/web/.next/static "$REL/web/apps/web/.next/static"
  cp -a apps/web/public/. "$REL/web/apps/web/public/"
  pnpm --filter @jobsmith/api deploy --prod --legacy "$REL/apps/api" >/dev/null
  cp -a apps/api/dist/. "$REL/apps/api/dist/"
  # The API reads data/ (salary rules, demo pages) and prompts/ relative to its dist folder.
  cp -a data prompts ecosystem.config.cjs "$REL/"
  ln -sfn "$APP_DIR/shared/api.env" "$REL/apps/api/.env"
  ln -sfn "$APP_DIR/shared/web.env" "$REL/web/.env"
else
  echo "   release $RUN is already live (no rebuild)"
fi

if [[ -n "$MIGRATE" ]]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/shared/api.env" | cut -d= -f2-)
  export DATABASE_URL
  # Dump the database first, keep the newest 5.
  mkdir -p "$BACKUPS_DIR"
  f="$BACKUPS_DIR/$DB_NAME-$(date -u +%Y%m%dT%H%M%SZ).dump"
  (umask 077; pg_dump -Fc "$DATABASE_URL" > "$f")
  ls -1t "$BACKUPS_DIR/$DB_NAME"-*.dump | tail -n +6 | xargs -r rm -f
  echo "   backup: $f"
  (cd "$REL/apps/api" && node_modules/.bin/prisma migrate deploy)
  unset DATABASE_URL
fi

if [[ "$RUN" != "$LIVE_RUN" ]]; then
  switch "$RUN"
  pm2_start
fi

if [[ $SEED -eq 1 ]]; then
  grep -q '^DEMO_MODE=true' "$APP_DIR/shared/api.env" || { echo "--seed is only allowed when DEMO_MODE=true" >&2; exit 1; }
  echo "   seeding the demo account"
  (cd "$APP_DIR/current/apps/api" && node --env-file=.env dist/seed.js)
fi

# Check the server's own ports (the public URL may not point here yet).
web=000; api=000
for _ in $(seq 1 30); do
  sleep 2
  web=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/" || true)
  api=$(curl -s -o /dev/null -w '%{http_code}' "$API_INTERNAL/api/health" || true)
  [[ "$web" == 200 && "$api" == 200 ]] && break
done
echo "   server check: web $web, /api/health $api"
if [[ "$web" != 200 || "$api" != 200 ]]; then
  if [[ -n "$LIVE_RUN" && "$LIVE_RUN" != "$RUN" ]]; then
    echo "Check failed: switching back to $LIVE_RUN" >&2
    switch "$LIVE_RUN"
    pm2_start
  fi
  exit 1
fi
# Keep the live release and the one before it (for a quick switch back).
cd "$APP_DIR/releases" && { ls -1t | grep -vx "$RUN" || true; } | tail -n +2 | xargs -r rm -rf
REMOTE

web=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$URL" || true); api=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$URL/api/health" || true)
echo "$URL -> $web, /api/health -> $api"
[[ "$web" == 200 && "$api" == 200 ]] || echo "(The server itself is healthy; the public URL may not point at it yet.)"
