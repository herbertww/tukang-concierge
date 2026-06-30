#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME:$PATH"

# Load .env
set -a
source .env
set +a

STRIPE_KEY="$STRIPE_SECRET_KEY"
[[ -n "$STRIPE_KEY" ]] || { echo "ERROR: STRIPE_SECRET_KEY not set in .env"; exit 1; }

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# 1. Create product
log "Creating product 'Tukang Service Fee'..."
PRODUCT_JSON=$(curl -s -X POST https://api.stripe.com/v1/products \
  -u "$STRIPE_KEY:" \
  -d "name=Tukang Service Fee" \
  -d "type=service")
PRODUCT_ID=$(echo "$PRODUCT_JSON" | jq -r '.id')
[[ -n "$PRODUCT_ID" ]] || die "Failed to create product: $PRODUCT_JSON"
log "✓ Product created: $PRODUCT_ID"

# 2. Create price (SGD 5.00)
log "Creating price SGD 5.00..."
PRICE_JSON=$(curl -s -X POST https://api.stripe.com/v1/prices \
  -u "$STRIPE_KEY:" \
  -d "product=$PRODUCT_ID" \
  -d "currency=sgd" \
  -d "unit_amount=500")
PRICE_ID=$(echo "$PRICE_JSON" | jq -r '.id')
[[ -n "$PRICE_ID" ]] || die "Failed to create price: $PRICE_JSON"
log "✓ Price created: $PRICE_ID"

# 3. Create webhook endpoint
log "Creating webhook endpoint..."
WEBHOOK_JSON=$(curl -s -X POST https://api.stripe.com/v1/webhook_endpoints \
  -u "$STRIPE_KEY:" \
  -d "url=https://tukang.app/api/payments/webhook" \
  -d "enabled_events[]=payment_intent.succeeded" \
  -d "enabled_events[]=payment_intent.payment_failed" \
  -d "enabled_events[]=payment_intent.created")
WEBHOOK_ID=$(echo "$WEBHOOK_JSON" | jq -r '.id')
WEBHOOK_SECRET=$(echo "$WEBHOOK_JSON" | jq -r '.secret')
[[ -n "$WEBHOOK_ID" && -n "$WEBHOOK_SECRET" ]] || die "Failed to create webhook: $WEBHOOK_JSON"
log "✓ Webhook created: $WEBHOOK_ID"

# 4. Update .env
log "Updating .env..."
sed -i.bak "s/^STRIPE_SERVICE_FEE_PRICE_ID=.*/STRIPE_SERVICE_FEE_PRICE_ID=$PRICE_ID/" .env
sed -i.bak "s/^STRIPE_WEBHOOK_SECRET=.*/STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET/" .env
rm -f .env.bak

log ""
log "================================================================"
log "✅ Setup complete!"
log "================================================================"
log "Price ID:           $PRICE_ID"
log "Webhook Secret:     …${WEBHOOK_SECRET: -4}"
log "================================================================"
