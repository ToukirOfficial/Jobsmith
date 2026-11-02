#!/usr/bin/env bash
# Deploys Jobsmith (Next.js web, NestJS API, BullMQ worker under PM2) to your server over SSH.
# Built on this machine from a clean clone of HEAD, never on the server. Works on macOS and Linux/WSL.
#   ./deploy.sh          build HEAD, upload release local-<sha>, dump + migrate if needed, switch, check
#   ./deploy.sh --check  show uncommitted files, pending migrations and the live release; changes nothing
#
# Nothing about the server is committed: every value comes from ./deploy.env (gitignored; copy
# deploy.env.example). Before the first deploy, create on the server:
#   $APP_DIR/shared/api.env   the API's production .env (DATABASE_URL, REDIS_URL, secrets, API_PORT, ...)
#   $APP_DIR/shared/web.env   APP_URL and API_INTERNAL_URL=http://127.0.0.1:$API_PORT
# and point the nginx vhost at 127.0.0.1:$WEB_PORT (with proxy_buffering off for /api/v1/agent-runs/).
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

MODE=deploy
for a in "$@"; do
  case "$a" in
    --check) MODE=check ;;
    *) echo "Unknown option: $a" >&2; exit 1 ;;
  esac
done

# Node: nvm first (WSL/Linux and Mac), Homebrew only as a fallback.
export NVM_DIR="$HOME/.nvm"
set +u
for f in "$NVM_DIR/nvm.sh" /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh; do
  [[ -s "$f" ]] && { . "$f"; break; }
done
nvm use -s 24 >/dev/null 2>&1 || nvm use -s default >/dev/null 2>&1 || true
set -u
if ! command -v node >/dev/null; then
  for d in /opt/homebrew/bin /usr/local/bin; do [[ -x "$d/node" ]] && export PATH="$d:$PATH" && break; done
fi
command -v pnpm >/dev/null || { echo "pnpm not found (corepack enable)." >&2; exit 1; }

SHA=$(git rev-parse HEAD)
RUN="local-${SHA:0:7}"
DIRTY=$(git status --porcelain)
git fetch -q origin
PUSHED=1; [[ "$SHA" == "$(git rev-parse '@{u}' 2>/dev/null || true)" ]] || PUSHED=0
APPLIED=$(ssh "$HOST" "sudo -u postgres psql -d $DB_NAME -Atc 'select migration_name from _prisma_migrations where finished_at is not null' 2>/dev/null || true")
PENDING=$(comm -23 <(git ls-tree --name-only "$SHA" apps/api/prisma/migrations/ | xargs -n1 basename | grep -E '^[0-9]' | sort) <(echo "$APPLIED" | sort))
LIVE_RUN=$(ssh "$HOST" "basename \$(readlink $APP_DIR/current 2>/dev/null) 2>/dev/null || true")

if [[ "$MODE" == check ]]; then
  echo "== Uncommitted files =="; echo "${DIRTY:-(none)}"
  echo "== Pushed to origin: $([[ $PUSHED -eq 1 ]] && echo yes || echo 'no, push first')"
  echo "== Pending migrations =="; echo "${PENDING:-(none)}"
  echo "== Live: ${LIVE_RUN:-(none)}, would deploy: $RUN"
  exit 0
fi
[[ -z "$DIRTY" ]] || { echo "Uncommitted changes; commit them first:" >&2; echo "$DIRTY" >&2; exit 1; }
[[ $PUSHED -eq 1 ]] || { echo "HEAD is not pushed to origin; push first." >&2; exit 1; }
ssh "$HOST" "test -f $APP_DIR/shared/api.env && test -f $APP_DIR/shared/web.env" || { echo "Create $APP_DIR/shared/api.env and web.env on the server first (see the top of deploy.sh)." >&2; exit 1; }

TMP=$(mktemp -d); TUNNEL=""
cleanup() { [[ -n "$TUNNEL" ]] && pkill -f "$TUNNEL" || true; rm -rf "$TMP"; }
trap cleanup EXIT
as_site() { ssh "$HOST" "sudo -iu $SITE_USER bash -c $(printf %q "$1")"; }
pm2_start() {
  as_site "cd $APP_DIR/current && for p in api worker web; do pm2 delete $PM2_PREFIX-\$p >/dev/null 2>&1 || true; done && PM2_PREFIX=$PM2_PREFIX WEB_PORT=$WEB_PORT API_PORT=$API_PORT pm2 start ecosystem.config.cjs >/dev/null && pm2 save >/dev/null"
}

if [[ "$RUN" != "$LIVE_RUN" ]]; then
  echo "== Building release $RUN here (clean clone, no local .env) =="
  B="$TMP/src"
  git clone -q "$PWD" "$B" && git -C "$B" checkout -q "$SHA"
  (
    cd "$B"
    pnpm install --frozen-lockfile >/dev/null
    [[ ! -e .env && ! -e apps/web/.env && ! -e apps/api/.env ]] || { echo "A .env file is in the build clone; refusing." >&2; exit 1; }
    # Production values only: a clean environment, not this shell's.
    env -i PATH="$PATH" HOME="$HOME" NVM_DIR="${NVM_DIR:-}" NODE_ENV=production API_INTERNAL_URL="$API_INTERNAL" APP_URL="$URL" pnpm build >/dev/null
    # The /api rewrite is fixed at build time: it must point at the server's API, never a local port.
    node -e 'const m=require("./apps/web/.next/routes-manifest.json"); const r=[].concat(m.rewrites.beforeFiles||[],m.rewrites.afterFiles||[],m.rewrites.fallback||[],Array.isArray(m.rewrites)?m.rewrites:[]); const d=r.find((x)=>x.source==="/api/:path*"); if(!d||d.destination!==process.argv[1]+"/api/:path*"){console.error("Build check failed: /api rewrite is "+(d&&d.destination));process.exit(1)}' "$API_INTERNAL"
    R=release
    mkdir -p $R/web/apps/web/.next $R/web/apps/web/public
    cp -a apps/web/.next/standalone/. $R/web/
    cp -a apps/web/.next/static $R/web/apps/web/.next/static
    cp -a apps/web/public/. $R/web/apps/web/public/
    pnpm --filter @jobsmith/api deploy --prod --legacy $R/apps/api >/dev/null
    cp -a apps/api/dist/. $R/apps/api/dist/
    # The API reads data/ (salary rules, demo pages) and prompts/ relative to its dist folder.
    cp -a data prompts ecosystem.config.cjs $R/
    tar -czf "$TMP/release.tgz" -C $R .
  )
  REL="$APP_DIR/releases/$RUN"
  echo "== Uploading release $RUN =="
  rsync -q "$TMP/release.tgz" "$HOST:/tmp/jobsmith-$RUN.tgz"
  ssh "$HOST" "set -e; rm -rf $REL; mkdir -p $REL; tar -xzf /tmp/jobsmith-$RUN.tgz -C $REL; rm /tmp/jobsmith-$RUN.tgz; ln -sfn $APP_DIR/shared/api.env $REL/apps/api/.env; ln -sfn $APP_DIR/shared/web.env $REL/web/.env; chown -R $SITE_USER:$SITE_USER $REL"
else
  echo "== Release $RUN is already live (no rebuild) =="
fi

if [[ -n "$PENDING" ]]; then
  echo "== Pending migrations: $(echo $PENDING) =="
  # Dump the database first, keep the newest 5.
  ssh "$HOST" "set -e; mkdir -p $BACKUPS_DIR; f=$BACKUPS_DIR/$DB_NAME-\$(date -u +%Y%m%dT%H%M%SZ).dump; sudo -u postgres pg_dump -Fc $DB_NAME > \$f; chown $SITE_USER:$SITE_USER \$f; ls -1t $BACKUPS_DIR/$DB_NAME-*.dump | tail -n +6 | xargs -r rm -f; echo \"backup: \$f\""
  # The release has the Prisma CLI, but migrating from here keeps the server lean: through an SSH tunnel.
  PORT=55437
  TUNNEL="ssh -fNT -o ExitOnForwardFailure=yes -L $PORT:127.0.0.1:5432 $HOST"
  $TUNNEL
  DATABASE_URL=$(ssh "$HOST" "grep -E '^DATABASE_URL=' $APP_DIR/shared/api.env | cut -d= -f2-" | sed -E "s#@(127\.0\.0\.1|localhost):5432/#@127.0.0.1:$PORT/#") \
    pnpm --filter @jobsmith/api exec prisma migrate deploy
fi

PREV_RUN=$LIVE_RUN
if [[ "$RUN" != "$LIVE_RUN" ]]; then
  echo "== Switching to release $RUN =="
  ssh "$HOST" "ln -sfn $APP_DIR/releases/$RUN $APP_DIR/current.new && mv -T $APP_DIR/current.new $APP_DIR/current && chown -h $SITE_USER:$SITE_USER $APP_DIR/current"
  pm2_start
fi

sleep 6
web=$(curl -s -o /dev/null -w '%{http_code}' "$URL"); api=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/v1/health")
echo "$URL -> $web, /api/v1/health -> $api"
if [[ "$web" != 200 || "$api" != 200 ]]; then
  if [[ -n "$PREV_RUN" && "$PREV_RUN" != "$RUN" ]]; then
    echo "Check failed: switching back to $PREV_RUN" >&2
    ssh "$HOST" "ln -sfn $APP_DIR/releases/$PREV_RUN $APP_DIR/current.new && mv -T $APP_DIR/current.new $APP_DIR/current && chown -h $SITE_USER:$SITE_USER $APP_DIR/current"
    pm2_start
  fi
  exit 1
fi
# Only the live release is kept (no old code backups).
ssh "$HOST" "cd $APP_DIR/releases && ls -1 | grep -vx '$RUN' | xargs -r rm -rf"
