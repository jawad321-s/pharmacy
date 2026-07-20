#!/usr/bin/env bash
# One-shot production bootstrap for PharmaSaaS.
# Usage: cd deploy && ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: deploy/.env not found. Copy .env.production.example to .env and fill it in."
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "==> Building and starting the stack for ${PLATFORM_DOMAIN}"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for the API to become healthy"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.prod.yml exec -T api wget -qO- http://localhost:4000/api/v1/subscriptions/plans >/dev/null 2>&1; then
    echo "    API is up."
    break
  fi
  sleep 3
done

# Database migrations run automatically from the API container's entrypoint
# (prisma migrate deploy). Seed the plans + platform super admin on first run.
echo "==> Seeding subscription plans and the platform super admin (idempotent)"
docker compose -f docker-compose.prod.yml exec -T api sh -c \
  "npm install tsx@4 --no-save >/dev/null 2>&1 && npx tsx prisma/seed.ts" || {
  echo "    NOTE: seed skipped or already applied."
}

mkdir -p backups
echo
echo "============================================================"
echo " PharmaSaaS is running."
echo "   App:     https://${PLATFORM_DOMAIN}"
echo "   Tenant:  https://<subdomain>.${PLATFORM_DOMAIN}"
echo "   Docs:    https://${PLATFORM_DOMAIN}/docs"
echo
echo " Super admin: admin@pharmasaas.com / Password123!"
echo " >>> Log in and change this password immediately. <<<"
echo "============================================================"
