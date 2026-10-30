#!/bin/sh
# Build one conference and rsync it to the web server, then refresh the
# landing page (list of conferences) and redirects from legacy URLs.
# Usage: scripts/deploy.sh [conference-id]   (default: ieeevis2026)
# Server details live in the gitignored .env.deploy (see .env.deploy.example).
set -e
cd "$(dirname "$0")/.."

[ -f .env.deploy ] || { echo "Missing .env.deploy (copy .env.deploy.example)"; exit 1; }
. ./.env.deploy
: "${DEPLOY_HOST:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_ROOT:?}" "${SITE_ROOT_URL:?}"

CONFERENCE=${1:-ieeevis2026}
export CONFERENCE
config() { node -e "const c = require('./conferences/$CONFERENCE/config.json'); console.log([].concat(c.$1 ?? []).join(' '))"; }
DEPLOY_DIR=$(config deployDir)
LEGACY_DIRS=$(config legacyDirs)
SSH="ssh -i $DEPLOY_SSH_KEY"

rm -rf dist src/.observablehq/cache
npm run build

$SSH "$DEPLOY_HOST" "mkdir -p '$DEPLOY_ROOT/$DEPLOY_DIR'"
rsync -avz --delete -e "$SSH" dist/ "$DEPLOY_HOST:$DEPLOY_ROOT/$DEPLOY_DIR/"

# Landing page at the app root (only index.html; never --delete there: it holds every conference)
PAGES=$(mktemp -d)
APP_ROOT=$(dirname "$DEPLOY_DIR")
node scripts/landing.js landing "$PAGES/index.html"
rsync -avz -e "$SSH" "$PAGES/index.html" "$DEPLOY_HOST:$DEPLOY_ROOT/$APP_ROOT/index.html"

for legacy in $LEGACY_DIRS; do
  mkdir -p "$PAGES/$legacy"
  node scripts/landing.js redirect "$SITE_ROOT_URL/$DEPLOY_DIR/" "$PAGES/$legacy/index.html"
  $SSH "$DEPLOY_HOST" "mkdir -p '$DEPLOY_ROOT/$legacy'"
  rsync -avz -e "$SSH" "$PAGES/$legacy/index.html" "$DEPLOY_HOST:$DEPLOY_ROOT/$legacy/index.html"
done
rm -rf "$PAGES"
echo "Deployed $CONFERENCE to $SITE_ROOT_URL/$DEPLOY_DIR/"
