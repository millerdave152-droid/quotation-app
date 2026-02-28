# CLAUDE.md — Teletime Quotation & POS System

## Project Overview

Combined **Customer Quotation Management App** and **Point of Sale (POS) System** for **Teletime Superstore**, a 40+ year family-owned retail business in Mississauga, Ontario. Sells appliances, furniture, TVs, and electronics to consumers and institutional clients (housing authorities, schools, municipalities). ~10 staff, 2,100+ products from Samsung, LG, Whirlpool, KitchenAid, etc.

Websites: maifurniture.ca, teletime.ca

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  QUOTATION FRONTEND (React 19.2 + CRA — Port 3000)      │
│  Admin/CRM dashboard: quotes, customers, products,       │
│  analytics, reports, leads, inventory, marketplace        │
│  79+ lazy-loaded routes                                   │
├──────────────────────────────────────────────────────────┤
│  POS FRONTEND (React 18.2 + Vite 5.1 — Port 5173)       │
│  Touchscreen POS for in-store: checkout, cash drawer,     │
│  receipts, returns, commissions, shift management         │
│  PWA-enabled with offline support (Dexie/IndexedDB)       │
├──────────────────────────────────────────────────────────┤
│  BACKEND (Express 5.1.0 / Node 20 — Port 3001)          │
│  147 route files, 169 services, 12 middleware             │
│  Entry: backend/server.js                                 │
├──────────────────────────────────────────────────────────┤
│  DATABASE: PostgreSQL on AWS RDS (us-east-1)             │
│  Multi-tenant with Row-Level Security (RLS)               │
│  269 migrations, dual connection pools (admin + app)      │
│  Redis optional (falls back to in-memory/PostgreSQL)      │
└──────────────────────────────────────────────────────────┘
```

## How to Run

Three separate terminals:

```bash
# Terminal 1 — Backend
cd backend
node server.js
# http://localhost:3001

# Terminal 2 — Quotation Frontend
cd frontend
npm start
# http://localhost:3000 (proxied to backend)

# Terminal 3 — POS Frontend
cd apps/pos
npm run dev
# http://localhost:5173 (proxied to backend)
```

## Key File Locations

| What | Where |
|------|-------|
| Backend entry | `backend/server.js` |
| DB pool (dual-pool, tenant-aware) | `backend/db.js` |
| Routes | `backend/routes/` (147 files) |
| Services | `backend/services/` (169 files) |
| Middleware | `backend/middleware/` (12 files) |
| Migrations | `backend/migrations/` (269 files) |
| Utils | `backend/utils/` — apiResponse.js, password.js, jwt.js, permissions.js, money.js, logger.js |
| Config | `backend/config/` — database.js, redis.js, cache-config.js, import-config.js |
| Tests | `backend/__tests__/` (40 test files, Jest) |
| Scripts | `backend/scripts/` (130+ import, test, analysis scripts) |
| Frontend components | `frontend/src/components/` |
| Frontend contexts | `frontend/src/contexts/` — AuthContext, QuoteContext, ProductContext, ThemeContext |
| Frontend services | `frontend/src/services/` |
| POS components | `apps/pos/src/components/` |
| POS contexts | `apps/pos/src/context/` — AuthContext, CartContext, RegisterContext, CommissionContext |
| POS stores | `apps/pos/src/store/` (Zustand) |
| Deploy config | `deploy/` — deploy.sh, ec2-setup.sh, .env.production.template |
| CI/CD | `.circleci/config.yml`, `.gitlab-ci.yml` |
| Docker | `docker-compose.yml` (backend, frontend, pos) |

## Tech Stack

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express 5.1.0
- **Database**: pg 8.16.3 (PostgreSQL driver), dual-pool with RLS
- **Auth**: jsonwebtoken + bcrypt (JWT with refresh tokens)
- **Validation**: express-validator, joi, zod
- **Security**: helmet, cors, express-rate-limit, input sanitization
- **Caching**: ioredis (optional), node-cache (in-memory)
- **Email**: nodemailer + @aws-sdk/client-ses (AWS SES)
- **PDF**: pdfkit, puppeteer (headless Chrome)
- **Payments**: Moneris (primary), Stripe (secondary), e-Transfer
- **File handling**: multer, xlsx (SheetJS), csv-parse, sharp (images)
- **Real-time**: ws (WebSockets)
- **AI**: @anthropic-ai/sdk (Claude API)
- **Scheduling**: node-cron
- **Logging**: pino + pino-pretty
- **Barcodes/QR**: bwip-js, qrcode
- **Testing**: Jest 30 + supertest

### Quotation Frontend
- **React**: 19.2.0 (CRA / react-scripts 5.0.1)
- **UI**: @mui/material 7.3.6 + @emotion + lucide-react
- **Routing**: react-router-dom 6.30.2
- **Styling**: Tailwind CSS 4.1 + Emotion
- **Charts**: recharts 3.6
- **HTTP**: axios
- **PDF**: jsPDF + jspdf-autotable
- **Storage**: Dexie (IndexedDB)
- **State**: React Context (Auth, Quote, Product, Theme)

### POS Frontend
- **React**: 18.2.0 (Vite 5.1.0)
- **UI**: @mui/material 7.3.7 + lucide-react
- **State**: Zustand 4.5 + React Context (Cart, Register, Commission)
- **Offline**: Dexie + idb-keyval + service worker (PWA)
- **Immutability**: immer
- **Charts**: recharts 3.7

### Cloud Services
- **AWS RDS** — PostgreSQL hosting (us-east-1)
- **AWS SES** — Transactional email
- **AWS S3** — File storage
- **Redis** — Optional caching/fraud velocity (falls back to PostgreSQL)

## Database

### Connection Architecture
Two separate pools in `backend/db.js`:
- **rawPool** (dbadmin) — Bypasses RLS. Used for auth, background jobs, migrations.
- **appPool** (app_user) — Subject to RLS. Used for all request-scoped queries.
- **Tenant context** via AsyncLocalStorage — automatically sets `app.current_tenant` per request.

### Pricing
**CRITICAL**: Cents-based integer pricing throughout.
- All prices stored as integers in cents (e.g., $1,299.99 = 129999)
- Margins in basis points (1 BP = 0.01%)
- Ontario HST applies
- Convert to dollars only for display
- **Never use float/decimal for monetary values**

### Key Tables
| Table | Purpose |
|-------|---------|
| products | Product catalog (2,100+ items), cents-based pricing |
| customers | Customer/contact info (**no `active` column** — use `is_active` on users) |
| quotations / quotation_items | Quote headers and line items |
| orders / order_items | Order management |
| transactions | POS transaction records (PK: `transaction_id`) |
| invoices | Invoice/AR tracking |
| pos_returns | Returns (PK: `id`, not `return_id`) |
| price_rules / price_changes | Pricing rules and history |
| activities | CRM tasks and follow-ups |
| leads | Lead pipeline (`follow_up_date` is DATE type) |
| audit_log | Audit trail (has `shift_id`, `risk_score` columns) |
| fraud_alerts / fraud_incidents | Fraud detection system |
| velocity_events | Transaction velocity tracking |
| warranty_products | Warranty catalog (incl. Excelsior) |
| store_settings | Application configuration |
| import_logs | CSV import tracking |
| scheduled_reports | Has `report_type` column |
| report_templates | **No `report_type` column** |

## API Patterns

### Response Helpers
All routes use standardized response helpers from `backend/utils/apiResponse.js`:
```js
res.success(data)        // 200 with { success: true, data }
res.created(data)        // 201
res.error(message, code) // error response
```

### Route Structure
Routes are modular files in `backend/routes/`. Each exports a function that receives dependencies:
```js
// Typical route file pattern
module.exports = function(pool, serviceInstance) {
  const router = require('express').Router();
  // ... routes
  return router;
};
```

### Auth & Permissions
- JWT auth via `backend/middleware/auth.js`
- Permission checking via `backend/middleware/checkPermission.js`
- Login response returns `data.accessToken` (not `token`)
- Test credentials: `admin@yourcompany.com` / `TestPass123!`

### Middleware Stack (order in server.js)
1. Helmet security headers
2. Input sanitization
3. CORS
4. Rate limiting
5. JSON/URL-encoded body parsing
6. Static file serving (/models, /uploads, /vendor-images)
7. Response helpers
8. Request logging (pino with correlation IDs)

## Major Subsystems

### Fraud Detection
- **Migration**: 098 + subsequent (8 tables, materialized view, 10 rules, 7 permissions)
- **Services**: FraudDetectionService, FraudScoringService, VelocityService, BINValidationService, AuditLogService, EmployeeMonitorService
- **Middleware**: `fraudCheck.js` on transaction create/void/refund
- **Routes**: `fraud.js`, `audit.js`
- **Frontend**: FraudDashboard at `/admin/fraud` (5 tabs)
- **POS**: FraudAlertBanner, FraudBlockedModal in CheckoutModal

### Payment Processing
- **Moneris** (primary) — `MonerisService.js`, `moneris.js` routes, webhook verification
- **Stripe** (secondary) — `StripeService.js`, `stripe.js` routes
- **E-Transfer** — `ETransferService.js`
- **Store Credits** — `store-credits.js` routes
- **Financing** — `FinancingService.js`

### Order Amendments & Credit Memos
- **Routes**: `order-modifications.js`, `credit-memos.js`
- **Frontend**: OrderEditModal, AmendmentTimeline in QuoteViewer
- **POS**: Quick amendment form (qty/remove), credit memo indicator
- **Numbering**: CM-YYYY format

### Excelsior Warranty
- **Migration**: 096 — 187 SKUs from Phoenix A.M.D.
- **Claims**: SOS Warranty Services 1-800-661-7313
- **Columns on warranty_products**: sale_context, provider_code (VARCHAR 30), provider_sku

### CE Integration (Icecat + PricesAPI)
- **Migration**: 121 — adds data_source, icecat_product_id, ce_specs to products
- **Icecat API**: `https://live.icecat.biz/api` with `shopname=` param, `GTIN=` param
- **Services**: icecatService.js, barcodeLookupService.js, pricesApiService.js
- **Routes**: `ce-pricing.js`, `admin/ce-import.js`

### CSV Import Pipeline
- chokidar watches designated folder for new CSV files
- Auto-imports into products table
- Tracked in import_logs, price changes in price_changes
- Supports bulk imports from manufacturer price lists

### Marketplace Integration
- Mirakl marketplace sync (Best Buy, etc.)
- `marketplace.js` routes, `miraklService.js`
- Multi-channel listing management

### Scheduled Jobs (cron in server.js)
| Schedule | Job |
|----------|-----|
| Every 5 min | Expire stale discount escalations |
| Hourly | Employee monitor metrics refresh |
| Daily 2 AM | Discontinued product auto-hide |
| Daily 2:30 AM | CLV calculation (if enabled) |
| Daily 3 AM | Audit log hash-chain verification |
| Daily 4 AM | Velocity events cleanup (30+ days) |
| Daily 8:15 AM (weekdays) | Daily digest job |
| Weekly Sun 5 AM | BIN cache expiration cleanup |

## Testing

```bash
# Backend tests (Jest)
cd backend
npm test                    # Run all tests with coverage
npm run test:watch          # Watch mode

# Linting
npm run lint                # ESLint
npm run lint:fix            # Auto-fix
npm run format              # Prettier

# Migrations
npm run migrate             # Run pending
npm run migrate:status      # Check status
npm run migrate:dry-run     # Preview
```

Test files are in `backend/__tests__/` (40 files covering products, quotes, orders, pricing, tax, warranties, fraud, email, etc.)

Frontend services also have test files in `frontend/src/services/` (28+ test files).

## Code Style & Conventions

- **Semicolons**: Always
- **Quotes**: Single quotes
- **Print width**: 100 columns
- **Trailing commas**: None
- **Arrow parens**: Always
- **Indentation**: 2 spaces
- **End of line**: LF
- **Async/await** for all async operations
- **Functional components with hooks** in React
- **axios** for all frontend HTTP requests
- **Environment variables** in `.env` for all secrets
- **ESLint + Prettier** configured (`backend/eslint.config.js`, `.prettierrc`)

## Common Gotchas

| Issue | Detail |
|-------|--------|
| `customers` table | Has NO `active` column. Use `is_active` on `users` table |
| `follow_up_date` in `leads` | DATE type — `CURRENT_DATE - date` returns int, not interval |
| `report_templates` | Has NO `report_type` column |
| `scheduled_reports` | Has `report_type` column |
| `products.category` | VARCHAR, NOT NULL — must include in INSERTs |
| `products.sku` | NO unique constraint — use SELECT+INSERT, not ON CONFLICT |
| `competitor_prices` | NO unique constraint on (product_id, competitor_name) — use DELETE+INSERT |
| `competitor_prices` | Mixed TIMESTAMPTZ/TIMESTAMP columns — use explicit casts |
| `pos_returns` PK | Is `id` (not `return_id`) |
| `transactions` PK | Is `transaction_id` |
| `ALTER TYPE ... ADD VALUE` | Must commit separately before using new enum value |
| Windows Git Bash | Avoid inline `$()` and piping to node stdin; use script files |
| Login response | Uses `data.accessToken` (not `token`) |
| Icecat API | Use `https://live.icecat.biz/api` with `shopname=` (NOT `icecat.us/api/rest` with `login=`) |
| Icecat search | Use `GTIN=` param (NOT `ean_upc=`). Returns 400 with StatusCode=16 for not-found |
| Category IDs | TVs=27, Audio=28, MajorAppliances=1 (children 6-15), SmallAppliances=3, Accessories=5 |

## What NOT to Do

- **Do NOT** change pricing from cents-based to dollar-based
- **Do NOT** switch database from PostgreSQL to another DB
- **Do NOT** use float or decimal for monetary values — always integer cents
- **Do NOT** remove or modify the CSV import pipeline
- **Do NOT** hardcode AWS credentials — always use `.env`
- **Do NOT** add `active` column to `customers` — it doesn't exist
- **Do NOT** use ON CONFLICT for tables without unique constraints (products.sku, competitor_prices)

## Deployment

- **Docker Compose**: 3 services (backend:3001, frontend:80, pos:80)
- **CI/CD**: CircleCI (primary) + GitLab CI
- **Target**: AWS EC2 (t3.medium) + RDS
- **Health checks**: `GET /health`, `GET /ready` (k8s readiness), `GET /api/health` (legacy)
- **Graceful shutdown**: Handles SIGTERM/SIGINT, stops cron jobs, closes WebSocket/DB

## Related Systems (Separate Repos)

- **SalesMgr** — Serverless AWS CRM (Lambda, DynamoDB, API Gateway, Twilio WhatsApp). Do not mix code.
- **Excel automation tools** — VBA-based inventory and pricing tools. Separate from this app.
