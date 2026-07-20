# PharmaSaaS — Production Deployment Guide

This guide takes you from a bare Ubuntu server to a running, TLS-secured,
backed-up PharmaSaaS platform serving pharmacies on tenant subdomains.

Estimated time: **~45–60 minutes** once you have the server, domain and SMTP
credentials ready.

---

## 0. What you need before you start

| Item | Notes |
|------|-------|
| **Ubuntu server** | 22.04/24.04, 2 vCPU / 4 GB RAM minimum, a public IP |
| **A domain** | e.g. `pharmasaas.ps`. You must control its DNS |
| **SMTP account** | Gmail SMTP, SendGrid, Mailgun, etc. — for password resets & alerts |
| **SSH access** | root or a sudo user |

---

## 1. Point DNS at the server

Create these DNS records (replace the IP with your server's):

```
A     pharmasaas.ps        ->  203.0.113.10
A     *.pharmasaas.ps      ->  203.0.113.10     (wildcard — every tenant)
A     cdn.pharmasaas.ps    ->  203.0.113.10     (optional, for uploads)
```

The wildcard `*.pharmasaas.ps` is what lets `alshifa.pharmasaas.ps`,
`lifecare.pharmasaas.ps`, … all resolve to the same app.

---

## 2. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out/in afterwards
```

---

## 3. Get the code and configure

```bash
git clone <your-repo-url> pharmasaas
cd pharmasaas/deploy
cp .env.production.example .env

# Generate strong secrets
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "S3_ACCESS_KEY=$(openssl rand -hex 12)"
echo "S3_SECRET_KEY=$(openssl rand -hex 24)"

nano .env   # paste the values above, set PLATFORM_DOMAIN and SMTP_*
```

---

## 4. Obtain a wildcard TLS certificate

A wildcard cert (`*.pharmasaas.ps`) requires a **DNS-01** challenge, so you
prove domain ownership by adding a TXT record.

```bash
sudo apt-get update && sudo apt-get install -y certbot

sudo certbot certonly --manual --preferred-challenges dns \
  --agree-tos -m you@pharmasaas.ps \
  -d 'pharmasaas.ps' -d '*.pharmasaas.ps'
```

Certbot prints a `_acme-challenge` TXT value — add it in your DNS panel, wait
a minute, then press Enter. The certificate is written to
`/etc/letsencrypt/live/pharmasaas.ps/` which the Nginx container mounts
read-only.

> **Renewal:** wildcard DNS-01 certs don't auto-renew via HTTP. Re-run the
> command every ~80 days, or automate it with your DNS provider's certbot
> plugin (e.g. `certbot-dns-cloudflare`). After renewing, run
> `docker compose -f docker-compose.prod.yml restart nginx`.

---

## 5. Launch

```bash
./deploy.sh
```

This builds the images, starts everything, runs database migrations
automatically, and seeds the subscription plans + platform super admin.

Visit:

- **https://pharmasaas.ps** — marketing/landing + tenant registration
- **https://pharmasaas.ps/docs** — API documentation (Swagger)
- Any new pharmacy registers at the landing page and gets
  `https://<their-subdomain>.pharmasaas.ps`

**First login (platform admin):** `admin@pharmasaas.com` / `Password123!` —
change this password immediately under Settings.

---

## 6. How pharmacies subscribe (manual billing)

Billing is handled manually — ideal for bank transfer / cash collection:

1. A pharmacy registers → gets a **14-day trial** automatically.
2. In-app they pick a plan (**Subscription** page) → this creates a **pending
   invoice**.
3. They pay you by bank transfer / cash.
4. You mark it paid: either the tenant records the payment in-app, or you
   confirm it as platform admin. The subscription activates and the period
   extends.

The daily job warns tenants whose subscription is ending and suspends expired
ones automatically (they can still log in to renew).

---

## 7. Backups

The `backup` service dumps the database nightly to `deploy/backups/` and keeps
the last `BACKUP_RETENTION_DAYS` (default 14). To restore:

```bash
./restore.sh backups/pharmasaas-20260720-030000.sql.gz
```

Copy `deploy/backups/` off-server regularly (e.g. `rsync` to object storage).

---

## 8. Operations cheatsheet

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# Update to a new release
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Manual backup now
docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/backup.sh

# Stop / start
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 9. Security checklist before go-live

- [ ] Changed the super admin password
- [ ] All secrets in `.env` are unique and random (never the examples)
- [ ] Firewall: allow only 22, 80, 443 (`ufw allow 22,80,443/tcp`)
- [ ] SSH key-only login, root login disabled
- [ ] `deploy/backups/` replicated off-server
- [ ] SMTP credentials verified (trigger a password reset to test)
- [ ] Wildcard certificate renewal reminder set (~80 days)
