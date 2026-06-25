# Deploying Tukang to Alibaba Cloud ECS

End-to-end guide to run the Tukang MCP server on an Alibaba Cloud ECS instance
with HTTPS (required for WhatsApp + Stripe webhooks). The repeatable parts are
scripted in `deploy/`; this doc covers the manual console steps around them.

---

## 1. Provision the ECS instance

1. Sign in at https://account.alibabacloud.com (verify identity, add a payment
   method — a personal card is fine, no company needed).
2. **ECS console → Instances → Create Instance**:
   - **Region:** `Singapore (ap-southeast-1)` — no China ICP filing required.
   - **Instance type:** 2 vCPU / 2 GB (e.g. `ecs.e-c1m1.large`).
   - **Image:** Ubuntu 22.04 LTS (64-bit).
   - **System disk:** 40 GB ESSD.
   - **Public IP:** assign a public IPv4 (pay-by-traffic), or attach an EIP.
   - **Bandwidth:** pay-as-you-go, a few Mbps is plenty.
   - **Key pair:** create one and download the `.pem` (used for SSH).
3. **Security group** — allow inbound:
   - `22/tcp` (SSH), `80/tcp` (HTTP, for cert issuance), `443/tcp` (HTTPS).
   - Do **not** expose `8000` — nginx proxies to it internally.
4. Launch and note the **public IP**.

## 2. Domain / DNS

Webhooks need a valid TLS cert, and Let's Encrypt won't issue for a bare IP.
Two options:

- **Free:** use `nip.io` — set `DOMAIN=<public-ip>.nip.io` in step 4. No DNS setup.
- **Real domain:** buy a cheap one (Porkbun / Cloudflare Registrar), add an
  **A record** (e.g. `api.yourdomain.com`) pointing to the ECS public IP. Wait
  for it to resolve (`ping api.yourdomain.com`).

## 3. Connect and pull the repo

```bash
ssh -i your-key.pem root@<public-ip>
git clone https://github.com/herbertww/tukang-concierge.git
cd tukang-concierge
```

## 4. Create `.env`

```bash
cp .env.example .env
nano .env          # fill in every key; set PUBLIC_URL=https://<your-domain>
```

Required keys: `MEM0_API_KEY WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
STRIPE_SERVICE_FEE_PRICE_ID QWEN_API_KEY EXA_API_KEY PUBLIC_URL`.

> Use a **permanent** WhatsApp System User token here, not the 24h temp token.

## 5. Run the one-shot setup

```bash
sudo DOMAIN=api.yourdomain.com EMAIL=you@example.com bash deploy/setup.sh
# nip.io example:
# sudo DOMAIN=1.2.3.4.nip.io EMAIL=you@example.com bash deploy/setup.sh
```

This installs Node 20 + nginx + certbot + pm2, builds the app, configures the
reverse proxy, obtains a Let's Encrypt cert, and starts Tukang under pm2.

## 6. Verify

```bash
curl https://<your-domain>/health        # -> {"status":"ok","tools":16,...}
pm2 logs tukang                            # watch runtime logs
```

## 7. Point the webhooks at the box

- **WhatsApp** (Meta App → WhatsApp → Configuration):
  - Callback URL: `https://<your-domain>/webhooks/whatsapp`
  - Verify token: value of `WHATSAPP_VERIFY_TOKEN` in `.env`
  - Subscribe to the **`messages`** field.
- **Stripe** (Dashboard → Developers → Webhooks):
  - Endpoint: `https://<your-domain>/webhooks/stripe`
  - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`, then `pm2 restart tukang`.

## Redeploying after a code change

```bash
cd ~/tukang-concierge
git pull
npm install
npm run build
pm2 restart tukang
```

## Notes

- sql.js is single-process — pm2 runs in **fork** mode (not cluster). Don't scale
  to multiple instances or you'll get divergent DB copies.
- The DB file `tukang.db` lives in the project root; it's the entire dataset.
  Back it up before redeploys if it holds real data.
- `src/lib/qwen.ts` is the proof-of-Alibaba-Cloud-usage file to link in the
  hackathon submission.
