#!/usr/bin/env bash
#
# Tukang — one-shot ECS provisioning script (Ubuntu 22.04).
# Installs Node 20, nginx, certbot, pm2; builds the app; wires TLS; starts it.
#
# Usage (run as root on the ECS box, from the cloned repo root):
#   sudo DOMAIN=api.yourdomain.com EMAIL=you@example.com bash deploy/setup.sh
#
# DOMAIN can be a real domain OR a nip.io host, e.g. DOMAIN=1.2.3.4.nip.io
#
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=api.yourdomain.com or DOMAIN=1.2.3.4.nip.io}"
: "${EMAIL:?Set EMAIL for Lets Encrypt, e.g. EMAIL=you@example.com}"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Tukang deploy: domain=$DOMAIN  app_root=$APP_ROOT"

# 1. System packages -----------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx certbot python3-certbot-nginx
npm install -g pm2

# 2. Build ---------------------------------------------------------------------
cd "$APP_ROOT"
npm install
npm run build

# 3. .env guard ----------------------------------------------------------------
if [ ! -f "$APP_ROOT/.env" ]; then
  echo "!! .env is MISSING. Copy .env.example to .env and fill keys before the app will work."
  echo "!! Remember to set PUBLIC_URL=https://$DOMAIN"
fi

# 4. nginx reverse proxy -------------------------------------------------------
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_ROOT/deploy/nginx.conf.template" \
  > /etc/nginx/sites-available/tukang
ln -sf /etc/nginx/sites-available/tukang /etc/nginx/sites-enabled/tukang
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# 5. TLS via Let's Encrypt -----------------------------------------------------
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

# 6. Start under pm2 -----------------------------------------------------------
pm2 start "$APP_ROOT/deploy/ecosystem.config.cjs"
pm2 save
# Make pm2 resurrect on reboot (prints+runs the systemd unit install):
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root | grep -E '^sudo' | bash || true

echo ""
echo "==> Done. Health check: curl https://$DOMAIN/health"
echo "==> Webhooks:"
echo "      WhatsApp: https://$DOMAIN/webhooks/whatsapp  (verify token from .env)"
echo "      Stripe:   https://$DOMAIN/webhooks/stripe"
