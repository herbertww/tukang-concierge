#!/usr/bin/env bash
# Provisions the Tukang Railway project, links this repo, pushes env vars from .env,
# deploys, and attaches the custom domain tukang.app.
set -euo pipefail

DOMAIN="tukang.app"
PROJECT_NAME="tukang"
SERVICE_NAME="tukang-mcp-server"

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# 1. Install Railway CLI if missing
if ! command -v railway >/dev/null 2>&1; then
  log "Railway CLI not found. Installing via npm..."
  npm install -g @railway/cli || die "Failed to install Railway CLI. Install Node/npm first."
fi
log "Railway CLI: $(railway --version)"

# 2. Auth (opens browser for login if not already logged in)
if ! railway whoami >/dev/null 2>&1; then
  log "Not logged in. Opening browser for Railway login..."
  railway login
fi
log "Logged in as: $(railway whoami)"

# 3. Init or link project
[[ -f .env ]] || die ".env not found in $(pwd). Run this from the tukang repo root."

if [[ ! -f railway.json && ! -d .railway ]]; then
  log "No existing Railway project link found. Creating project '$PROJECT_NAME'..."
  railway init --name "$PROJECT_NAME"
else
  log "Existing Railway project link detected, reusing it."
fi

# 4. First deploy creates the Railway service (variables can't be set before a service exists)
log "Deploying (initial pass, creates the service)..."
railway up --detach || die "Deploy failed."

# 5. Push every key from .env to Railway (skips blanks/comments)
log "Syncing .env vars to Railway..."
ENV_ARGS=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  [[ -z "$value" ]] && continue
  ENV_ARGS+=(--set "${key}=${value}")
done < .env

if [[ ${#ENV_ARGS[@]} -gt 0 ]]; then
  railway variables "${ENV_ARGS[@]}" || die "Failed to set Railway variables."
else
  log "WARNING: .env has no populated keys — nothing synced. Fill in .env first."
fi

railway variables --set "NODE_ENV=production" >/dev/null

# 6. Redeploy so the service picks up the new variables
log "Redeploying with variables applied..."
railway up --detach || die "Redeploy failed."

# 6. Generate a railway.app domain first (needed before custom domain attach works reliably)
log "Ensuring a public domain exists on the service..."
railway domain || true

# 7. Attach the custom domain
log "Attaching custom domain $DOMAIN ..."
DOMAIN_OUTPUT=$(railway domain "$DOMAIN" 2>&1) || true
echo "$DOMAIN_OUTPUT"

# 8. Extract the CNAME target Railway wants from the output (format varies by CLI version)
CNAME_TARGET=$(echo "$DOMAIN_OUTPUT" | grep -oE '[a-zA-Z0-9.-]+\.railway\.app' | head -n1 || true)

echo ""
echo "================================================================"
echo "Railway deploy complete."
echo ""
if [[ -n "$CNAME_TARGET" ]]; then
  echo "Now add this DNS record in your Namecheap dashboard"
  echo "(Domain List -> $DOMAIN -> Manage -> Advanced DNS -> Add New Record):"
  echo ""
  echo "  Type:   CNAME Record"
  echo "  Host:   @  (or 'www' if you want www.$DOMAIN instead)"
  echo "  Value:  $CNAME_TARGET"
  echo "  TTL:    Automatic"
  echo ""
  echo "Note: Namecheap does not allow CNAME on the root (@) for some plans —"
  echo "if it rejects '@', use an ALIAS/ANAME record if offered, or point"
  echo "'www' as the CNAME and set up a URL redirect from $DOMAIN -> www.$DOMAIN."
else
  echo "Could not auto-extract the CNAME target from Railway's output above."
  echo "Run 'railway domain' again or check the Railway dashboard -> Settings -> Domains"
  echo "for the exact target, then add it as a CNAME record in Namecheap for $DOMAIN."
fi
echo "================================================================"
echo "PUBLIC_URL in .env should be updated to: https://$DOMAIN"
