#!/usr/bin/env bash
# Ship code to the VPS. Run from MeetingTool/:  ./deploy.sh
#
# NEVER ships .env. The laptop and the server hold DIFFERENT config — PUBLIC_URL alone differs,
# and it decides the OAuth callback Google is told to use. An earlier ad-hoc `tar | ssh` included
# .env, so every deploy silently overwrote the server's settings with the laptop's, pointing the
# teammate connect flow at http://localhost:8790 and breaking it with redirect_uri_mismatch.
# Server config is edited on the server, once. Code comes from here.
set -euo pipefail

HOST="${MEETING_HOST:-adbundance-vps}"
DIR="${MEETING_DIR:-/root/meeting-tool}"

echo "→ ${HOST}:${DIR}"
tar czf - \
  --exclude=node_modules --exclude=work --exclude=dry-out \
  --exclude='*.log' --exclude=.oauth-pending.json \
  --exclude=.env --exclude=.env.example \
  --exclude=google-tokens.json \
  . | ssh "$HOST" "tar xzf - -C $DIR"

# google-tokens.json is pushed only on request: it is a credential, and clobbering the server's
# copy would drop teammates who connected through the hosted /connect flow (their tokens are
# written on the server, never here).
if [[ "${1:-}" == "--with-tokens" ]]; then
  echo "→ pushing google-tokens.json (overwrites the server's copy)"
  scp -q google-tokens.json "$HOST:$DIR/google-tokens.json"
  ssh "$HOST" "chmod 600 $DIR/google-tokens.json"
fi

ssh "$HOST" "cd $DIR && docker restart meeting-tool >/dev/null && sleep 2 && docker logs meeting-tool 2>&1 | tail -1"
echo "✓ deployed"
