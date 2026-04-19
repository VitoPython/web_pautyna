# Deploying Pavutyna on Dokploy

Hetzner + Dokploy + Traefik + Let's Encrypt. Domain: `pavutyna.app`.

---

## 0. Prerequisites (one-time)

- Dokploy running on the Hetzner server
- DNS A-records for `pavutyna.app` and `www.pavutyna.app` → server IP
  (Cloudflare DNS only — NOT proxied)
- The domain DNS has propagated (check with `dig pavutyna.app` or `nslookup`)
- GitHub repo accessible to Dokploy (public is fine, or add deploy key)

---

## 1. Generate secrets locally

```bash
# JWT secret (48 chars)
python -c "import secrets; print(secrets.token_urlsafe(48))"

# Unipile webhook secret (same shape)
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Store both — you'll paste them into Dokploy in step 3.

---

## 2. Create the Dokploy application

1. Dokploy dashboard → **Projects** → pick or create a project (e.g. `pavutyna`)
2. **Create Service** → **Compose**
3. Config:
   - **Name:** `pavutyna`
   - **Source Type:** Git
   - **Repository URL:** `https://github.com/VitoPython/web_pautyna`
   - **Branch:** `main`
   - **Build Path:** `/` (repo root)
   - **Compose File:** `docker-compose.prod.yml`
   - **Auto Deploy:** on (redeploys on every push to main)

Don't hit Deploy yet — env vars come first.

---

## 3. Environment variables

In the application → **Environment** tab, paste this block and fill in the
blanks:

```env
PUBLIC_HOST=pavutyna.app

JWT_SECRET=<from step 1>

UNIPILE_API_KEY=<from Unipile dashboard>
UNIPILE_DSN=api38.unipile.com:16889
UNIPILE_WEBHOOK_SECRET=<from step 1>

ANTHROPIC_API_KEY=<console.anthropic.com>

MONGODB_URI=mongodb://mongodb:27017
MONGODB_DB_NAME=pavutyna
REDIS_URL=redis://redis:6379/0
```

**Save**, then hit **Deploy**.

---

## 4. First deploy flow

1. Dokploy clones the repo, builds images (frontend and backend — first
   build takes 4-8 min)
2. Starts the stack; Traefik picks up the labels and requests a Let's
   Encrypt cert for `pavutyna.app`
3. After ~30s the cert issues and `https://pavutyna.app` is live
4. Backend's lifespan calls `unipile_service.ensure_webhooks()` and
   registers `https://pavutyna.app/webhooks/unipile` on Unipile's side

Verify:

- `https://pavutyna.app/health` → `{"status":"ok","version":"0.1.0"}`
- `https://pavutyna.app` → Pavutyna login screen
- In Unipile dashboard → Webhooks → three entries pointing at `pavutyna.app`

---

## 5. Wire Unipile's webhook signature secret

Our `/webhooks/unipile` verifies incoming requests against
`UNIPILE_WEBHOOK_SECRET`. If Unipile's dashboard has a "Signing Secret"
field on the webhook, paste the same value you set in Dokploy's env.

If Unipile doesn't expose a signing secret for its dashboard-created
webhooks, leave `UNIPILE_WEBHOOK_SECRET` empty in prod for now — the
backend falls back to accepting unsigned requests (see
`backend/app/routers/webhooks.py` `_verify_signature`).

---

## 6. Post-deploy sanity checks

- Open the app on a fresh browser, register a new account, sign in
- `/integrations` → connect a Telegram account via the Unipile hosted link
- Send yourself a Telegram message → it should appear in `/inbox` within
  **a second** (webhooks are live now — polling fallback is still active
  but dwarfed by real-time)
- `/notifications` → toast + badge on sidebar
- `/ai` → chat with Claude Sonnet 4.6; tokens should stream smoothly
- Canvas → click a node → "AI Overview" → "Згенерувати"

---

## 7. Backups (minimum viable)

Dokploy has a built-in Backups tab per service for Mongo volumes. At
minimum: enable daily Mongo snapshots retained 7 days. Later move to
off-site backup via S3/Backblaze.

---

## 8. Updating

- Commit + push to `main` → Dokploy auto-rebuilds and redeploys
- For env-only changes (rotating a secret): edit in Dokploy UI → Redeploy
- For a rollback: Dokploy keeps previous deployments; click "Rollback" on
  the deployment history list
