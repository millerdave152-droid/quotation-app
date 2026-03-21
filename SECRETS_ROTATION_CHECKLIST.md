# Secrets Rotation Checklist

**Generated:** 2026-03-10
**Status:** PRE-PRODUCTION ROTATION REQUIRED

All secrets in `.env` must be rotated before production deployment. This file was generated
by a full-stack security audit. Follow each section in order.

---

## Phase 1: Self-Generated Secrets (Rotate Locally)

These secrets can be rotated immediately by generating new values locally.
New values have been pre-generated in `C:/tmp/generated_secrets.json`.

### 1.1 JWT Secrets

- [ ] **JWT_SECRET** — Main token signing key
  - Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  - Update in: `backend/.env`
  - Impact: All existing user sessions will be invalidated (users must re-login)

- [ ] **JWT_REFRESH_SECRET** — Refresh token signing key
  - Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  - Update in: `backend/.env`
  - Impact: All existing refresh tokens invalidated

### 1.2 Fraud Detection & Payment

- [ ] **FRAUD_SALT** — Card identifier hashing salt (currently using insecure default!)
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Update in: `backend/.env`
  - Impact: Existing velocity tracking hashes will no longer match (resets fraud history)

- [ ] **MONERIS_WEBHOOK_SECRET** — Payment webhook HMAC verification (currently EMPTY!)
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Update in: `backend/.env` AND Moneris merchant portal webhook configuration
  - Portal: https://www3.moneris.com/ (Merchant Login > Admin > Webhooks)
  - Impact: Webhook signature verification will start working (currently disabled)

### 1.3 VAPID Keys (Push Notifications)

- [ ] **VAPID_PUBLIC_KEY** + **VAPID_PRIVATE_KEY**
  - Generate: `npx web-push generate-vapid-keys`
  - Update in: `backend/.env`
  - Also update: `apps/pos/` environment if VAPID public key is referenced there
  - Impact: Existing push notification subscriptions will break (users must re-subscribe)

---

## Phase 2: Database Passwords (Rotate in AWS RDS)

### 2.1 Application User Password

- [ ] **DB_PASSWORD** — `app_user` database password
  - Rotation steps:
    1. Connect to RDS via psql as `dbadmin`
    2. Run: `ALTER USER app_user WITH PASSWORD 'NEW_PASSWORD_HERE';`
    3. Update `DB_PASSWORD` in `backend/.env`
    4. Restart backend server
  - AWS RDS Console: https://console.aws.amazon.com/rds/
  - Impact: Backend will fail to connect until .env is updated

### 2.2 Admin User Password

- [ ] **DB_ADMIN_PASSWORD** — `dbadmin` database password
  - Rotation steps:
    1. In AWS RDS Console, select the instance > Modify > Master password
    2. OR connect as current dbadmin and run: `ALTER USER dbadmin WITH PASSWORD 'NEW_PASSWORD_HERE';`
    3. Update `DB_ADMIN_PASSWORD` in `backend/.env`
    4. Restart backend server
  - AWS RDS Console: https://console.aws.amazon.com/rds/
  - Impact: Migrations and background jobs will fail until .env is updated

---

## Phase 3: External API Keys (Rotate in Provider Dashboards)

### 3.1 AWS IAM Credentials

- [ ] **AWS_ACCESS_KEY_ID** + **AWS_SECRET_ACCESS_KEY**
  - Portal: https://console.aws.amazon.com/iam/ > Users > Security credentials > Access keys
  - Steps:
    1. Create a new access key pair
    2. Update both values in `backend/.env`
    3. Verify SES email sending still works
    4. Deactivate the old access key
    5. After 48h with no issues, delete the old access key
  - Impact: Email sending (SES) and S3 uploads will break during rotation window

### 3.2 Anthropic API Key

- [ ] **ANTHROPIC_API_KEY**
  - Portal: https://console.anthropic.com/settings/keys
  - Steps:
    1. Generate a new API key
    2. Update in `backend/.env`
    3. Verify AI assistant features work
    4. Delete the old key
  - Impact: AI assistant, voice note structuring, and smart suggestions will fail during rotation

### 3.3 Best Buy Marketplace (Mirakl)

- [ ] **MIRAKL_API_KEY**
  - Portal: https://marketplace.bestbuy.ca (Seller login > Settings > API Keys)
  - Steps:
    1. Generate a new API key in the Best Buy Seller Portal
    2. Update in `backend/.env`
    3. Verify marketplace sync works
    4. Revoke the old key
  - Impact: Marketplace order sync and product listing updates will fail during rotation

### 3.4 Whirlpool Central

- [ ] **WHIRLPOOL_CENTRAL_PASSWORD**
  - Portal: https://www.whirlpoolcentral.ca/ (Login > Account Settings > Change Password)
  - Steps:
    1. Change password in Whirlpool Central portal
    2. Update `WHIRLPOOL_CENTRAL_PASSWORD` in `backend/.env`
  - Impact: Vendor product scraping will fail during rotation

### 3.5 Barcode Lookup API

- [ ] **BARCODE_LOOKUP_API_KEY**
  - Portal: https://www.barcodelookup.com/api (Dashboard > API Keys)
  - Steps:
    1. Generate a new API key (or regenerate existing)
    2. Update in `backend/.env`
  - Impact: CE product imports will fall back to ICECAT during rotation

### 3.6 ICECAT Credentials

- [ ] **ICECAT_USERNAME**
  - Portal: https://icecat.biz/en/login/ (Account Settings)
  - Steps:
    1. Change password at icecat.biz
    2. Update `ICECAT_USERNAME` in `backend/.env` (if username changes)
  - Impact: Fallback product data source unavailable during rotation

### 3.7 PricesAPI

- [ ] **PRICES_API_KEY**
  - Portal: https://www.pricesapi.com/ (Dashboard > API Keys)
  - Steps:
    1. Generate a new API key
    2. Update in `backend/.env`
  - Impact: Competitor pricing lookups will fail during rotation

---

## Phase 4: Frontend Secrets

### 4.1 AWS Cognito Config

- [ ] **Cognito userPoolId + userPoolClientId** — hardcoded in `frontend/src/aws-config.js`
  - These are technically public client-side values, but should be moved to env vars
  - Steps:
    1. Add `REACT_APP_COGNITO_USER_POOL_ID` and `REACT_APP_COGNITO_CLIENT_ID` to `frontend/.env`
    2. Update `aws-config.js` to read from `process.env.REACT_APP_COGNITO_*`
  - Portal: https://console.aws.amazon.com/cognito/ (User Pools)
  - Impact: No rotation needed unless the pool is compromised — just move to env vars

---

## Phase 5: Cleanup Hardcoded Scripts

The following backend root scripts contain hardcoded database passwords and should be
**deleted** (they are one-time utility scripts):

- [ ] `run-migration.js` (use `scripts/migrate.js` instead)
- [ ] `check-and-fix-quotations.js`
- [ ] `fix-unique-constraints.js`
- [ ] `fix-products-table.js`
- [ ] `fix-price-column.js`
- [ ] `setup-quotations.js`
- [ ] `setup-customers.js`
- [ ] `update-customers-table.js`
- [ ] `check-columns.js`
- [ ] `check-columns2.js`
- [ ] `test-write-ops.js`

---

## Phase 6: Update Production Secrets Store

After rotating all secrets locally, update the production secrets store.

### AWS Systems Manager Parameter Store / Secrets Manager

- [ ] Log in to AWS Console: https://console.aws.amazon.com/secretsmanager/
- [ ] Update each secret in the appropriate path:
  - `/teletime/production/db-password`
  - `/teletime/production/db-admin-password`
  - `/teletime/production/jwt-secret`
  - `/teletime/production/jwt-refresh-secret`
  - `/teletime/production/aws-access-key`
  - `/teletime/production/aws-secret-key`
  - `/teletime/production/anthropic-api-key`
  - `/teletime/production/mirakl-api-key`
  - `/teletime/production/fraud-salt`
  - `/teletime/production/moneris-webhook-secret`
  - `/teletime/production/vapid-private-key`
  - (Add others as needed)

### CircleCI Environment Variables

- [ ] Log in to CircleCI: https://app.circleci.com/
- [ ] Navigate to: Project Settings > Environment Variables
- [ ] Update each variable to match the new values in `backend/.env`
- [ ] Trigger a test build to verify deployment works with new secrets

---

## Phase 7: Post-Rotation Verification

After all secrets are rotated:

- [ ] Backend starts without error: `cd backend && node server.js`
- [ ] Frontend builds: `cd frontend && npx react-scripts build`
- [ ] POS builds: `cd apps/pos && npx vite build`
- [ ] Login works for all 3 test accounts
- [ ] Email sending works (test from admin panel)
- [ ] AI assistant responds (test a smart suggestion)
- [ ] Marketplace sync runs (check Best Buy orders)
- [ ] Push notifications deliver
- [ ] Payment webhooks verify (check Moneris test transaction)

---

## Security Reminders

- **NEVER** commit `.env` files to version control
- **NEVER** hardcode credentials in source files — always use `process.env`
- Rotate all secrets at minimum every 90 days
- Use AWS Secrets Manager with automatic rotation for production
- Set `DB_SSL_REJECT_UNAUTHORIZED=true` in production
- Remove `DANGEROUSLY_DISABLE_HOST_CHECK=true` from `frontend/.env` before production
