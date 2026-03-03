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
│  61 routes (51 lazy-loaded components)                    │
├──────────────────────────────────────────────────────────┤
│  POS FRONTEND (React 18.2 + Vite 5.1 — Port 5173)       │
│  Touchscreen POS for in-store: checkout, cash drawer,     │
│  receipts, returns, commissions, shift management         │
│  PWA-enabled with offline support (Dexie/IndexedDB)       │
├──────────────────────────────────────────────────────────┤
│  BACKEND (Express 5.1.0 / Node 20 — Port 3001)          │
│  154 route files, 161+ services, 9 middleware             │
│  Entry: backend/server.js (3,500+ lines)                  │
├──────────────────────────────────────────────────────────┤
│  DATABASE: PostgreSQL on AWS RDS (us-east-1)             │
│  Multi-tenant with Row-Level Security (RLS)               │
│  276 migrations (186 SQL + 90 JS), dual connection pools  │
│  In-memory caching (node-cache)                           │
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
| Routes | `backend/routes/` (145 top-level + `admin/`, `v1/` subdirs = 154 total) |
| Services | `backend/services/` (161 top-level + `ai/`, `channels/`, `skulytics/` subdirs) |
| Middleware | `backend/middleware/` (9 files) |
| Migrations | `backend/migrations/` (186 SQL + 90 JS + `skulytics/` subdir) |
| Utils | `backend/utils/` — apiResponse.js, password.js, jwt.js, permissions.js, money.js, logger.js |
| Config | `backend/config/` — database.js, cache-config.js, import-config.js |
| Jobs | `backend/jobs/` — scheduler.js + 9 background job files |
| Normalizers | `backend/normalizers/` — barcodeLookupNormalizer.js, icecatNormalizer.js |
| Scrapers | `backend/scrapers/` — NomenclatureScraper.js, WhirlpoolCentralScraper.js |
| Seeds | `backend/seeds/` — seed data (canadian-cities.json, canadian-names.json) |
| Shared | `backend/shared/` — middleware/, types/, validation/ (shared schemas) |
| Data | `backend/data/` — sample import templates |
| Tests | `backend/__tests__/` (39 test files, Jest) |
| Scripts | `backend/scripts/` (142 import, test, analysis scripts) |
| Frontend components | `frontend/src/components/` (33 subdirectories) |
| Frontend contexts | `frontend/src/contexts/` — AuthContext, QuoteContext, ProductContext, ThemeContext |
| Frontend services | `frontend/src/services/` (8 service files + 20 test files) |
| Frontend hooks | `frontend/src/hooks/` — useDraftPersistence, usePackageFilters, useQuotationState |
| Frontend pages | `frontend/src/pages/` (7 page components) |
| POS components | `apps/pos/src/components/` (29 subdirectories) |
| POS contexts | `apps/pos/src/context/` — Auth, Cart, Commission, Register, Volume |
| POS stores | `apps/pos/src/store/` (Zustand unified store, 9 files) |
| POS hooks | `apps/pos/src/hooks/` (28 custom hooks) |
| POS API layer | `apps/pos/src/api/` (21 API service files) |
| CI/CD | `.circleci/config.yml`, `.gitlab-ci.yml`, `.github/workflows/ci.yml` |
| Docker | `docker-compose.yml` (backend, frontend, pos) |

## Tech Stack

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express 5.1.0
- **Database**: pg 8.16.3 (PostgreSQL driver), dual-pool with RLS
- **Auth**: jsonwebtoken + bcrypt/bcryptjs (JWT with refresh tokens)
- **Validation**: express-validator, joi
- **Security**: helmet, cors, express-rate-limit, input sanitization
- **Caching**: node-cache (in-memory)
- **Email**: nodemailer + @aws-sdk/client-ses + @aws-sdk/client-sesv2 (AWS SES)
- **PDF**: pdfkit, puppeteer (headless Chrome), pdf-parse, pdf2json
- **Payments**: Moneris (primary), Stripe (secondary), e-Transfer
- **File handling**: multer, xlsx (SheetJS), csv-parse, csv-parser, sharp (images), archiver
- **Storage**: @aws-sdk/client-s3 (AWS S3)
- **Real-time**: ws (WebSockets)
- **AI**: @anthropic-ai/sdk (Claude API)
- **Scheduling**: node-cron
- **Logging**: pino + pino-pretty
- **Barcodes/QR**: bwip-js, qrcode
- **Notifications**: web-push (push notifications)
- **Testing**: Jest 30.2 + supertest
- **Linting**: ESLint 9 (flat config) + Prettier 3.6

### Quotation Frontend
- **React**: 19.2.0 (CRA / react-scripts 5.0.1)
- **UI**: @mui/material 7.3.6 + @emotion + lucide-react + @heroicons/react
- **Routing**: react-router-dom 6.30.2
- **Styling**: Tailwind CSS 4.1 + Emotion
- **Charts**: recharts 3.6
- **HTTP**: axios
- **PDF**: jsPDF + jspdf-autotable
- **Barcodes**: jsbarcode
- **Markdown**: react-markdown
- **Storage**: Dexie (IndexedDB)
- **3D**: @google/model-viewer
- **AWS**: aws-amplify + @aws-amplify/ui-react
- **State**: React Context (Auth, Quote, Product, Theme)

### POS Frontend
- **React**: 18.2.0 (Vite 5.1.0)
- **UI**: @mui/material 7.3.7 + lucide-react + @heroicons/react
- **State**: Zustand 4.5 + React Context (Auth, Cart, Commission, Register, Volume)
- **Offline**: Dexie + idb-keyval + service worker (PWA via vite-plugin-pwa)
- **Immutability**: immer
- **Charts**: recharts 3.7
- **Routing**: react-router-dom 6.22
- **IDs**: uuid

### Cloud Services
- **AWS RDS** — PostgreSQL hosting (us-east-1)
- **AWS SES** — Transactional email (SES v1 + v2 SDKs)
- **AWS S3** — File storage
- **AWS Amplify** — Frontend auth integration

## Database

### Connection Architecture
Two separate pools in `backend/db.js`:
- **rawPool** (dbadmin) — Bypasses RLS. Max 5 connections. Used for auth, background jobs, migrations.
- **appPool** (app_user) — Subject to RLS. Max 20 connections (configurable via `DB_POOL_MAX`). Used for all request-scoped queries.
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

Route subdirectories:
- `backend/routes/admin/` — Admin-only routes (2 files)
- `backend/routes/v1/` — Versioned API routes (7 files)

### Auth & Permissions
- JWT auth via `backend/middleware/auth.js`
- Permission checking via `backend/middleware/checkPermission.js`
- Login response returns `data.accessToken` (not `token`)
- Test credentials: `admin@yourcompany.com` / `TestPass123!`

### Middleware Stack (order in server.js)
1. Helmet security headers + custom security headers
2. Input sanitization
3. CORS
4. Rate limiting (generalLimiter)
5. JSON/URL-encoded body parsing
6. Static file serving (/models, /uploads, /vendor-images)
7. Response helpers (attachResponseHelpers)
8. Request logging (pino with correlation IDs)

### All Middleware Files
| File | Purpose |
|------|---------|
| `auth.js` | JWT authentication |
| `checkPermission.js` | Permission checking |
| `creditHoldCheck.js` | Credit hold validation |
| `errorHandler.js` | Error handling |
| `fraudCheck.js` | Fraud detection on transactions |
| `inventoryMiddleware.js` | Inventory-related checks |
| `security.js` | Security headers and sanitization |
| `tenantContext.js` | Tenant context management (RLS) |
| `validation.js` | Input validation |

## Major Subsystems

### AI Assistant
- **SDK**: @anthropic-ai/sdk (Claude API)
- **Services**: `backend/services/ai/` — context.js, featureFlags.js, tools.js, prompts/, router.js
- **Frontend**: AIAssistant component directory

### Fraud Detection
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
- **187 SKUs** from Phoenix A.M.D.
- **Claims**: SOS Warranty Services 1-800-661-7313
- **Columns on warranty_products**: sale_context, provider_code (VARCHAR 30), provider_sku

### CE Integration (Icecat + PricesAPI)
- **Icecat API**: `https://live.icecat.biz/api` with `shopname=` param, `GTIN=` param
- **Services**: icecatService.js, barcodeLookupService.js, pricesApiService.js
- **Normalizers**: barcodeLookupNormalizer.js, icecatNormalizer.js
- **Routes**: `ce-pricing.js`, `admin/ce-import.js`

### Skulytics Integration
- **Services**: `backend/services/skulytics/` — SkulyticsApiClient, SkulyticsSnapshotService, SkulyticsSyncService
- **Jobs**: `skulyticsSync.job.js` (registered in job scheduler)
- **Migrations**: `backend/migrations/skulytics/` (19 files)
- **Tests**: `backend/services/skulytics/__tests__/`

### CSV Import Pipeline
- chokidar watches designated folder for new CSV files
- Auto-imports into products table
- Tracked in import_logs, price changes in price_changes
- Supports bulk imports from manufacturer price lists

### Marketplace Integration
- Mirakl marketplace sync (Best Buy, etc.)
- **Services**: `backend/services/channels/` — ChannelAdapter, MiraklAdapter
- **Routes**: `marketplace.js`
- Multi-channel listing management

### Background Jobs (`backend/jobs/`)
| File | Purpose |
|------|---------|
| `scheduler.js` | Centralized job registry with startAll()/stopAll() lifecycle |
| `skulyticsSync.job.js` | Skulytics data synchronization |
| `autoTagJob.js` | Auto-tagging products |
| `churnAlertJob.js` | Customer churn detection alerts |
| `clvCalculationJob.js` | Customer lifetime value calculation |
| `discontinuedProductJob.js` | Discontinued product auto-hide |
| `marketplaceJobs.js` | Marketplace sync tasks |
| `nomenclatureScraperJob.js` | Product nomenclature scraping |
| `purchasingIntelligenceJob.js` | Purchasing intelligence analysis |
| `reminderJob.js` | Follow-up reminders |

### Scheduled Jobs (cron in server.js)
| Schedule | Job |
|----------|-----|
| Hourly | Employee monitor metrics refresh |
| Daily 3 AM | Audit log hash-chain verification |
| Daily 4 AM | Velocity events cleanup (30+ days) |
| Daily 9 AM | Chargeback deadline check |
| Weekly Sun 3:30 AM | Chain verification + compliance summary |
| Weekly Sun 5 AM | BIN cache expiration cleanup |
| Monthly 1st at 5 AM | Compliance report + log archive |

### Web Scrapers (`backend/scrapers/`)
- `NomenclatureScraper.js` — Product nomenclature data
- `WhirlpoolCentralScraper.js` — Whirlpool product data

## POS Offline Architecture

The POS frontend has a sophisticated offline-first architecture:

- **Unified Store** (`apps/pos/src/store/unifiedStore.js`): Zustand-based central state for customer, cart, discounts, pricing, and drafts
- **Offline Sync** (`offlineSync.js`): Transaction queue manager with `getSyncManager()`, `isOnline`, `waitForOnline`
- **Offline Approval Queue** (`offlineApprovalQueue.js`): Queues approval requests when offline
- **IDB Storage** (`idbStorage.js`): IndexedDB persistence for Zustand store
- **Draft API** (`draftApi.js`): Draft save/restore for in-progress transactions
- **Service Worker** (`apps/pos/src/sw.js`): Workbox-powered with precaching, StaleWhileRevalidate for products/customers, push notification support
- **PWA Manifest**: Standalone display, "TeleTime Point of Sale"

### POS Context Providers
| Context | Purpose |
|---------|---------|
| AuthContext | Authentication state |
| CartContext | Shopping cart management |
| CommissionContext | Sales commission tracking |
| RegisterContext | Cash register/shift management |
| VolumeContext | Volume-based pricing tiers |
| BatchEmailContext | Batch email operations (in `contexts/` subdir) |

## Testing

```bash
# Backend tests (Jest)
cd backend
npm test                    # Run all tests with coverage
npm run test:skulytics      # Skulytics + quotation engine tests
npm run test:watch          # Watch mode

# Backend linting
cd backend
npm run lint                # ESLint
npm run lint:fix            # Auto-fix
npm run format              # Prettier format
npm run format:check        # Prettier check only

# Frontend linting
cd frontend
npm run lint                # ESLint
npm run lint:fix            # Auto-fix
npm run lint:auth-fetch     # Check auth-fetch usage
npm run lint:axios          # Check axios imports
npm run lint:all            # All lint checks

# Frontend tests
cd frontend
npm test                    # react-scripts test

# POS linting
cd apps/pos
npm run lint                # ESLint (zero warnings enforced)
```

Test files are in `backend/__tests__/` (39 files covering products, quotes, orders, pricing, tax, warranties, fraud, email, etc.)

Frontend services have test files in `frontend/src/services/` (20 test files).

## Code Style & Conventions

- **Semicolons**: Always (ESLint error-level)
- **Quotes**: Single quotes (ESLint warn-level)
- **Print width**: 100 columns
- **Trailing commas**: None
- **Arrow parens**: Always
- **Indentation**: 2 spaces
- **End of line**: LF
- **ECMAScript**: 2022
- **Module system**: CommonJS (backend), ESM (POS frontend)
- **Async/await** for all async operations
- **Functional components with hooks** in React
- **axios** for all frontend HTTP requests
- **Environment variables** in `.env` for all secrets
- **ESLint**: Flat config format (`backend/eslint.config.js`), react-app preset (frontend)
- **Prettier**: Root `.prettierrc`
- **Unused vars**: Warn level, `_` prefix ignored

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
| POS dual context dirs | `apps/pos/src/context/` (primary) vs `apps/pos/src/contexts/` (secondary — BatchEmailContext) |

## What NOT to Do

- **Do NOT** change pricing from cents-based to dollar-based
- **Do NOT** switch database from PostgreSQL to another DB
- **Do NOT** use float or decimal for monetary values — always integer cents
- **Do NOT** remove or modify the CSV import pipeline
- **Do NOT** hardcode AWS credentials — always use `.env`
- **Do NOT** add `active` column to `customers` — it doesn't exist
- **Do NOT** use ON CONFLICT for tables without unique constraints (products.sku, competitor_prices)

## Deployment

- **Docker Compose**: 3 services (backend:3001, frontend:80, pos:5173→80)
  - POS uses `profiles: [full]` — must opt-in with `docker compose --profile full up`
  - Backend health check: `wget -qO- http://localhost:3001/health` (30s interval)
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) + CircleCI + GitLab CI
  - GitHub Actions: Node 18.x/20.x matrix, lint, test, build, security audit, Codecov
  - CircleCI: Node 20.11, backend test → frontend test → build
  - GitLab CI: test, build, security stages with Cobertura coverage
- **Target**: AWS EC2 (t3.medium) + RDS
- **Health checks**: `GET /health` (full — DB + cache), `GET /ready` (quick DB check), `GET /api/health` (legacy)
- **Graceful shutdown**: Handles SIGTERM/SIGINT, stops cron jobs, closes WebSocket/DB

## Related Systems (Separate Repos)

- **SalesMgr** — Serverless AWS CRM (Lambda, DynamoDB, API Gateway, Twilio WhatsApp). Do not mix code.
- **Excel automation tools** — VBA-based inventory and pricing tools. Separate from this app.
