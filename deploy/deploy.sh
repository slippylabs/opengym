#!/bin/sh
# Deploys fit.slippylabs.com from a commit (default HEAD), never from the working tree.
#   deploy/deploy.sh [rev]
# Builds the frontend in a scratch checkout, then installs the API into /opt/opengym and the SPA
# plus the exercise media into /var/www/fit.slippylabs.com, and restarts the service.
set -eu
REV=${1:-HEAD}
REPO=$(cd "$(dirname "$0")/.." && pwd)
SHA=$(git -C "$REPO" rev-parse --short "$REV")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive "$REV" | tar -x -C "$TMP"
VER=$(sed -n "s/.*v: '\([0-9.]*\)'.*/\1/p" "$TMP/frontend/src/lib/slip/meta.js" | head -1)
( cd "$TMP/frontend" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && APP_BUILD="slip$VER" npm run build >/dev/null )
( cd "$TMP/api" && npm ci --omit=dev --no-audit --no-fund >/dev/null )

# No rsync on this box: each tree is staged beside its target and swapped in with two renames,
# so a request never sees a half-copied directory.
swap() {  # swap <staged dir> <target dir>
  sudo rm -rf "$2.old"
  if [ -e "$2" ]; then sudo mv "$2" "$2.old"; fi
  sudo mv "$1" "$2"
  sudo rm -rf "$2.old"
}
sudo mkdir -p /opt/opengym
sudo rm -rf /opt/opengym/api.new && sudo cp -a "$TMP/api" /opt/opengym/api.new
sudo chown -R root:root /opt/opengym/api.new
swap /opt/opengym/api.new /opt/opengym/api
echo "$SHA" | sudo tee /opt/opengym/REVISION >/dev/null

WWW=/var/www/fit.slippylabs.com
sudo rm -rf "$WWW.new" && sudo cp -a "$TMP/frontend/dist" "$WWW.new"
sudo cp -a "$TMP/catalogue/media" "$WWW.new/exercise-media"
sudo chown -R root:root "$WWW.new"
swap "$WWW.new" "$WWW"

sudo install -m 0644 "$TMP/deploy/opengym.service" /etc/systemd/system/opengym.service
sudo systemctl daemon-reload
sudo systemctl restart opengym
~/tools/bin/check-stale-gz.sh --fix >/dev/null 2>&1 || echo "check-stale-gz failed; run it by hand"
echo "deployed $SHA (slip $VER)"
