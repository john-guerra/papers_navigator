#!/bin/sh
# Build one conference and rsync it to johnguerra.co.
# Usage: scripts/deploy.sh [conference-id]   (default: ieeevis2026)
set -e
cd "$(dirname "$0")/.."

CONFERENCE=${1:-ieeevis2026}
export CONFERENCE
DEPLOY_PATH=$(node -e "console.log(require('./conferences/$CONFERENCE/config.json').deployPath)")

rm -rf dist src/.observablehq/cache
npm run build
rsync -avz --delete --progress \
  -e "ssh -i /Users/aguerra/Dropbox/dutoVizNew.pem" \
  dist/ "ubuntu@johnguerra.co:$DEPLOY_PATH/"
