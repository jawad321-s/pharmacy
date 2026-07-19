# PharmaSaaS — Multi-Tenant SaaS Pharmacy Management Platform

A production-grade, cloud-based pharmacy management platform sold to pharmacies
as a subscription service. Every pharmacy (tenant) gets its own subdomain
(`alshifa.pharmasaas.com`) with completely isolated data on shared
infrastructure — from a single pharmacy to multi-branch chains.

Arabic and English with full RTL/LTR support, barcode-first POS with
FEFO (First-Expire-First-Out) batch selling, multi-branch inventory,
purchases, accounting, subscriptions and platform administration.

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15, React 19, TypeScript, TailwindCSS, shadcn-style UI, TanStack Query, React Hook Form, Zod |
| Backend    | NestJS, TypeScript, REST + OpenAPI/Swagger |
| Database   | PostgreSQL + Prisma ORM |
| Cache/Queue| Redis + BullMQ |
| Storage    | S3-compatible (MinIO in development) |
| Auth       | JWT access tokens + rotating refresh tokens, RBAC |
| Deploy     | Docker, Docker Compose, Nginx, Ubuntu |

## Repository Layout

```
apps/
├── api/                  # NestJS backend
│   ├── prisma/           # Schema, migrations, demo seed
│   ├── src/
│   │   ├── common/       # Guards, decorators, RBAC matrix, interceptors
│   │   ├── prisma/       # Prisma service
│   │   └── modules/
│   │       ├── auth/          # Login, register, refresh rotation, sessions
│   │       ├── tenants/       # Tenant profile & settings
│   │       ├── subscriptions/ # Plans, trials, billing, quotas, expiry cron
│   │       ├── users/         # Tenant user management, login history
│   │       ├── branches/      # Multi-branch management
│   │       ├── catalog/       # Categories & suppliers (+ ledger)
│   │       ├── customers/     # Customers & loyalty
│   │       ├── medicines/     # Medicines, batches, Excel import/export
│   │       ├── inventory/     # FEFO stock engine, counts, transfers, alerts
│   │       ├── sales/         # POS checkout, returns, voids
│   │       ├── purchases/     # Orders, goods receipt, supplier payments
│   │       ├── accounting/    # Expenses, ledger, P&L, cash flow
│   │       ├── reports/       # 9 reports → PDF & Excel
│   │       ├── dashboard/     # Tenant KPIs & charts
│   │       ├── notifications/ # In-app + email (BullMQ)
│   │       ├── audit/         # Audit trail API
│   │       ├── admin/         # Super-admin platform dashboard
│   │       └── storage/       # S3 image uploads
│   └── test/             # E2E tests
└── web/                  # Next.js frontend
    └── src/
        ├── app/          # Landing, auth, tenant app, admin pages
        ├── components/   # UI kit + app shell
        ├── lib/          # API client, i18n (en/ar), utils
        ├── locales/      # Translation dictionaries
        └── stores/       # Zustand stores (auth, POS cart)
docker/                   # Nginx reverse proxy config
docker-compose.yml        # Full production stack
.github/workflows/ci.yml  # CI: typecheck, tests, e2e, docker build
```

## Quick Start (Development)

Prerequisites: Node.js ≥ 20, Docker.

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure (PostgreSQL, Redis, MinIO, MailHog)
docker compose up -d postgres redis minio minio-init mailhog

# 3. Configure the API
cp apps/api/.env.example apps/api/.env
# defaults work for local development

# 4. Create the database schema and demo data
cd apps/api
npx prisma migrate deploy
npm run db:seed
cd ../..

# 5. Run both apps
npm run dev:api    # http://localhost:4000  (Swagger at /docs)
npm run dev:web    # http://localhost:3000
```

### Demo accounts (password `Password123!`)

| Account | Role |
|---|---|
| `admin@pharmasaas.com` | Platform Super Admin |
| `owner@alshifa.com` | Pharmacy Owner (demo tenant) |
| `manager@alshifa.com` | Branch Manager |
| `pharmacist@alshifa.com` | Pharmacist |
| `cashier@alshifa.com` | Cashier |
| `inventory@alshifa.com` | Inventory Manager |
| `accountant@alshifa.com` | Accountant |

## Production Deployment (Ubuntu + Docker)

```bash
# On the server
git clone <this repo> pharmasaas && cd pharmasaas
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, JWT secrets (openssl rand -hex 32),
# S3 keys, SMTP provider and PLATFORM_DOMAIN.

docker compose up -d --build

# Seed plans + super admin (first run only)
docker compose exec api sh -c "npm install tsx@4 --no-save && npx tsx prisma/seed.ts"
```

DNS: point `pharmasaas.com` and a wildcard `*.pharmasaas.com` A-record at the
server. Nginx (bundled) routes every tenant subdomain to the app. Terminate
TLS with a wildcard certificate (e.g. certbot's DNS challenge) in front of the
bundled Nginx or by extending `docker/nginx.conf`.

## Key Design Decisions

### Multi-tenancy
Shared-database, shared-schema. Every business table carries `tenantId` with
composite indexes; all queries in every service are scoped by the tenant id
taken from the verified JWT — never from client input. Cascading deletes clean
up all tenant data. Plan quotas (branches / users / products) are enforced
server-side on every create.

### FEFO batch selling
Stock is tracked per **batch per branch** (`StockItem`). The POS allocator
(`StockService.allocateFefo`) always sells from the batch closest to expiry,
skips expired batches entirely, and uses guarded decrements
(`UPDATE … WHERE quantity >= n`) inside a transaction so overselling is
impossible even under concurrency. Batch allocations are stored on each sale
item so returns restock the exact batches that were sold.

### Security
- bcrypt (12 rounds) password hashing
- Short-lived access tokens + rotating refresh tokens, hashed at rest, with
  reuse detection that revokes the whole token family
- Global RBAC guard with a permission matrix per tenant role; platform roles
  (Super Admin / Support) are separate
- Subscription guard suspends expired tenants (billing endpoints stay open)
- class-validator whitelisting on every DTO, Prisma parameterized queries,
  helmet, rate limiting (global + strict on auth), audit logging with
  sensitive-field redaction

### Accounting
Sales, purchases, supplier payments and expenses post balanced double-entry
ledger lines (`CASH`, `SALES_REVENUE`, `COGS`, `INVENTORY`, `TAX_PAYABLE`,
`ACCOUNTS_PAYABLE`, …). P&L and cash-flow statements are derived from real
transactions, not ad-hoc aggregates.

## Testing

```bash
# Unit tests (FEFO engine, RBAC matrix, plan quotas)
npm test

# E2E (requires running postgres + redis with migrations + seed)
cd apps/api && npm run test:e2e

# Coverage
cd apps/api && npm run test:cov
```

CI (GitHub Actions) runs typecheck, unit tests with coverage, migrations,
seed and e2e against real PostgreSQL/Redis services, builds the Next.js app
and both Docker images.

## API Documentation

Swagger UI is served at **`/docs`** with bearer-token auth persistence.
All endpoints are grouped by module with typed DTOs and examples.

## License

Proprietary — commercial SaaS product.
