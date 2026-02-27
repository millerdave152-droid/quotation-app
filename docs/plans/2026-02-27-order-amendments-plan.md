# Order Amendment System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing order amendment system with CRA-compliant credit memos, Back Office editing UI, and POS amendment enhancements.

**Architecture:** Build on existing `OrderModificationService`, `order_amendments` tables, and routes (migrations 004 + 008). Add new `credit_memos` tables (migration 155), a `CreditMemoService` with PDF generation, credit memo API routes, three Back Office React components (`OrderEditModal`, `AmendmentTimeline`, `PendingAmendments`), and POS enhancements. Admin + Manager get full access; others need approval.

**Tech Stack:** Express 5.1 backend, PostgreSQL, PDFKit, React 19 (CRA) frontend, React 18 (Vite) POS app, SES for email, Joi for validation.

**Design doc:** `docs/plans/2026-02-27-order-amendments-design.md`

---

## Task 1: Database Migration — Credit Memo Tables & Permissions

**Files:**
- Create: `backend/migrations/155_credit_memos.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration 155: Credit Memo System
-- CRA-compliant credit memos with line-level tracking, reason codes, and permissions

BEGIN;

-- ============================================================================
-- 1. Credit memo reason codes lookup table
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_memo_reason_codes (
  code        VARCHAR(50) PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO credit_memo_reason_codes (code, label, description, sort_order) VALUES
  ('price_adjustment',   'Price Adjustment',    'Unit price changed after original sale',            1),
  ('item_return',        'Item Return',         'Customer returned one or more items',               2),
  ('order_cancellation', 'Order Cancellation',  'Full order cancelled after invoicing',              3),
  ('quantity_change',    'Quantity Change',      'Quantity reduced on one or more line items',        4),
  ('billing_error',      'Billing Error',        'Incorrect charge corrected',                       5),
  ('goodwill',           'Goodwill',             'Discretionary credit issued to maintain relations', 6)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. Credit memo status enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE credit_memo_status AS ENUM ('draft', 'issued', 'applied', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. Credit memo number sequence
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS credit_memo_number_seq START WITH 1 INCREMENT BY 1;

-- ============================================================================
-- 4. Credit memos table
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_memos (
  id                      SERIAL PRIMARY KEY,
  credit_memo_number      VARCHAR(20) UNIQUE,
  order_id                INTEGER NOT NULL REFERENCES orders(order_id),
  amendment_id            INTEGER REFERENCES order_amendments(id),
  original_invoice_number VARCHAR(50),
  customer_id             INTEGER REFERENCES customers(id),
  reason                  TEXT,
  internal_notes          TEXT,
  reason_code             VARCHAR(50) REFERENCES credit_memo_reason_codes(code),
  subtotal_cents          INTEGER NOT NULL,
  discount_cents          INTEGER NOT NULL DEFAULT 0,
  hst_cents               INTEGER NOT NULL DEFAULT 0,
  gst_cents               INTEGER NOT NULL DEFAULT 0,
  pst_cents               INTEGER NOT NULL DEFAULT 0,
  tax_total_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents             INTEGER NOT NULL,
  province                VARCHAR(2),
  status                  credit_memo_status NOT NULL DEFAULT 'draft',
  application_method      VARCHAR(30),
  issued_at               TIMESTAMPTZ,
  issued_by               INTEGER REFERENCES users(id),
  applied_at              TIMESTAMPTZ,
  applied_by              INTEGER REFERENCES users(id),
  voided_at               TIMESTAMPTZ,
  voided_by               INTEGER REFERENCES users(id),
  void_reason             TEXT,
  pdf_url                 TEXT,
  created_by              INTEGER NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_memos_order       ON credit_memos(order_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_customer    ON credit_memos(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_amendment   ON credit_memos(amendment_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_status      ON credit_memos(status);
CREATE INDEX IF NOT EXISTS idx_credit_memos_created     ON credit_memos(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_credit_memo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_memo_timestamp ON credit_memos;
CREATE TRIGGER trg_credit_memo_timestamp
  BEFORE UPDATE ON credit_memos
  FOR EACH ROW EXECUTE FUNCTION update_credit_memo_timestamp();

-- ============================================================================
-- 5. Credit memo lines table
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_memo_lines (
  id                       SERIAL PRIMARY KEY,
  credit_memo_id           INTEGER NOT NULL REFERENCES credit_memos(id) ON DELETE CASCADE,
  line_number              INTEGER NOT NULL,
  product_id               INTEGER REFERENCES products(id),
  product_sku              VARCHAR(100),
  product_name             VARCHAR(500),
  quantity                 INTEGER NOT NULL,
  original_unit_price_cents INTEGER NOT NULL,
  credited_unit_price_cents INTEGER NOT NULL,
  discount_cents           INTEGER NOT NULL DEFAULT 0,
  tax_rate                 NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_cents                INTEGER NOT NULL DEFAULT 0,
  line_total_cents         INTEGER NOT NULL,
  description              TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_memo_lines_memo ON credit_memo_lines(credit_memo_id);

-- ============================================================================
-- 6. Permissions for amendments and credit memos
-- ============================================================================
INSERT INTO permissions (code, name, description, category) VALUES
  ('orders.amend',          'Amend Own Orders',     'Create amendments on own orders',               'hub'),
  ('orders.amend.any',      'Amend Any Order',      'Create amendments on any order (admin/manager)', 'hub'),
  ('orders.amend.approve',  'Approve Amendments',   'Approve or reject pending amendments',           'hub'),
  ('credit_memos.create',   'Create Credit Memos',  'Create and issue credit memos',                  'hub'),
  ('credit_memos.view',     'View Credit Memos',    'View credit memos and download PDFs',            'hub'),
  ('credit_memos.apply',    'Apply Credit Memos',   'Apply credit memos (refund/store credit)',       'hub'),
  ('credit_memos.void',     'Void Credit Memos',    'Void issued or applied credit memos',            'hub')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.code IN (
    'orders.amend', 'orders.amend.any', 'orders.amend.approve',
    'credit_memos.create', 'credit_memos.view', 'credit_memos.apply', 'credit_memos.void'
  )
ON CONFLICT DO NOTHING;

-- Grant to manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND p.code IN (
    'orders.amend', 'orders.amend.any', 'orders.amend.approve',
    'credit_memos.create', 'credit_memos.view', 'credit_memos.apply'
  )
ON CONFLICT DO NOTHING;

-- Grant view + amend to senior_sales and sales
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('senior_sales', 'sales')
  AND p.code IN ('orders.amend', 'credit_memos.view')
ON CONFLICT DO NOTHING;

COMMIT;
```

**Step 2: Run migration**

Run: `psql -U your_user -d quotationapp -f backend/migrations/155_credit_memos.sql`
Expected: All tables, indexes, triggers, and permissions created without errors.

**Step 3: Verify tables exist**

Run: `node -e "const pool = require('./backend/db'); (async()=>{const r=await pool.query(\"SELECT tablename FROM pg_tables WHERE tablename IN ('credit_memos','credit_memo_lines','credit_memo_reason_codes') ORDER BY 1\"); console.log(r.rows); process.exit(0)})()"`
Expected: Three rows: `credit_memo_lines`, `credit_memo_reason_codes`, `credit_memos`

**Step 4: Commit**

```bash
git add backend/migrations/155_credit_memos.sql
git commit -m "feat: Add credit memo tables, reason codes, and amendment permissions (migration 155)"
```

---

## Task 2: CreditMemoService — Core Business Logic

**Files:**
- Create: `backend/services/CreditMemoService.js`

**Reference files:**
- `backend/services/OrderModificationService.js` — constructor pattern (lines 11-19), tax rates (lines 744-758)
- `backend/services/PdfService.js` — PDF generation pattern (lines 50-55, 64-212)
- `backend/services/POSInvoiceService.js` — SES email pattern (lines 66-101)

**Step 1: Write the service**

Create `backend/services/CreditMemoService.js` with all methods. Key implementation notes:

```javascript
/**
 * TeleTime - Credit Memo Service
 *
 * CRA-compliant credit memo lifecycle:
 * draft → issued (assigns sequential number) → applied (refund/store credit) or voided
 */

const PDFDocument = require('pdfkit');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

// Same province tax rates as OrderModificationService (lines 744-758)
const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0 },
  NB: { hst: 0.15, gst: 0, pst: 0 },
  NS: { hst: 0.15, gst: 0, pst: 0 },
  NL: { hst: 0.15, gst: 0, pst: 0 },
  PE: { hst: 0.15, gst: 0, pst: 0 },
  BC: { hst: 0, gst: 0.05, pst: 0.07 },
  SK: { hst: 0, gst: 0.05, pst: 0.06 },
  MB: { hst: 0, gst: 0.05, pst: 0.07 },
  QC: { hst: 0, gst: 0.05, pst: 0.09975 },
  AB: { hst: 0, gst: 0.05, pst: 0 },
  NT: { hst: 0, gst: 0.05, pst: 0 },
  NU: { hst: 0, gst: 0.05, pst: 0 },
  YT: { hst: 0, gst: 0.05, pst: 0 },
};

class CreditMemoService {
  constructor(pool, cache = null, config = {}) {
    this.pool = pool;
    this.cache = cache;
    // Company details for PDF (same pattern as POSInvoiceService lines 71-87)
    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TeleTime POS';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';
    // SES for email
    this.sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.fromEmail = config.fromEmail || process.env.EMAIL_FROM || 'invoices@teletime.ca';
  }
```

**Methods to implement (in this order):**

1. **`_calculateTax(subtotalCents, province)`** — Returns `{ hstCents, gstCents, pstCents, taxTotalCents }` using TAX_RATES. QC is compound (PST on amount + GST). Return integers via `Math.round()`.

2. **`createFromAmendment(amendmentId, userId)`** — Query `order_amendments` + `order_amendment_items`. For each item where `change_type` is 'remove' or 'modify': calculate the credit delta (`(previous_price * previous_qty) - (applied_price * new_qty)`). Only include lines with positive deltas (credits). Get order's province and customer_id. Calculate tax. Insert into `credit_memos` (status='draft') + `credit_memo_lines`. Return the new credit memo.

3. **`createManual(orderId, { lines, reason, reasonCode, internalNotes }, userId)`** — Manual creation. Validate reason_code against `credit_memo_reason_codes`. Calculate subtotal from lines, then tax. Insert into both tables. Return new credit memo.

4. **`issue(creditMemoId, userId)`** — Verify status='draft'. Assign `credit_memo_number` via `SELECT LPAD(nextval('credit_memo_number_seq')::text, 6, '0')`. Update status='issued', issued_at=NOW(), issued_by.

5. **`apply(creditMemoId, applicationMethod, userId)`** — Verify status='issued'. Validate applicationMethod is one of: 'refund_to_original', 'store_credit', 'manual_adjustment'. Update status='applied', applied_at, applied_by, application_method.

6. **`void(creditMemoId, reason, userId)`** — Verify status in ('issued', 'applied'). Update status='voided', voided_at, voided_by, void_reason.

7. **`generatePdf(creditMemoId)`** — Detailed in Task 3.

8. **`emailCreditMemo(creditMemoId)`** — Generate PDF buffer, then send via SES (pattern from POSInvoiceService). Attach PDF, send to customer email.

9. **`getById(id)`** — JOIN credit_memos with credit_memo_lines, credit_memo_reason_codes, customers, users (created_by, issued_by, applied_by). Return full object.

10. **`listByOrder(orderId)`** — Query credit_memos WHERE order_id, ORDER BY created_at DESC.

11. **`listAll({ status, customerId, orderId, dateFrom, dateTo, page, limit })`** — Filtered, paginated list with customer name join. Default limit=50.

**Step 2: Verify the service loads without errors**

Run: `node -e "const CreditMemoService = require('./backend/services/CreditMemoService'); console.log('OK:', typeof CreditMemoService)"`
Expected: `OK: function`

**Step 3: Commit**

```bash
git add backend/services/CreditMemoService.js
git commit -m "feat: Add CreditMemoService with full lifecycle and tax calculation"
```

---

## Task 3: Credit Memo PDF Generation

**Files:**
- Modify: `backend/services/CreditMemoService.js` (the `generatePdf` method)

**Reference files:**
- `backend/services/PdfService.js` — Color scheme (lines 239-253), header pattern (lines 236-316), customer card (lines 329-439), items table (lines 492-694), totals card (lines 696-779), footer (lines 984-1024)

**Step 1: Implement `generatePdf(creditMemoId)`**

The PDF structure follows PdfService patterns. Key sections:

```javascript
async generatePdf(creditMemoId) {
  // 1. Fetch credit memo with lines, customer, order details
  const memo = await this.getById(creditMemoId);
  if (!memo) throw new Error('Credit memo not found');

  // 2. Create PDFKit document (same setup as PdfService line 225-233)
  const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: false });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  // 3. Colors (same as PdfService lines 239-253)
  const colors = {
    primary: '#1e40af',
    primaryLight: '#3b82f6',
    text: '#1f2937',
    textSecondary: '#374151',
    textMuted: '#6b7280',
    border: '#e5e7eb',
    background: '#f9fafb',
    white: '#ffffff',
    success: '#10b981',
    error: '#dc2626',
    warning: '#f59e0b',
  };

  // 4. Header — accent bar + company info (PdfService lines 236-275)
  //    - Top accent bar: doc.rect(0, 0, 612, 4).fill(colors.primary)
  //    - Company name left-aligned
  //    - "CREDIT MEMO" badge right-aligned (instead of "QUOTATION")
  //    - Credit memo number, date, original order number, original invoice number

  // 5. Customer card — BILL TO section (PdfService lines 329-400)
  //    - Customer name, address, email, phone

  // 6. Reference info box
  //    - Original Order: #ORD-XXXX
  //    - Original Invoice: #INV-XXXX
  //    - Reason: [reason text]
  //    - Reason Code: [label from lookup]

  // 7. Line items table with columns:
  //    Line # | SKU | Description | Qty | Original Price | Credited Price | Line Total
  //    - Zebra striping (PdfService lines 558-694)
  //    - Right-align numeric columns
  //    - Format cents as dollars: (cents / 100).toFixed(2)

  // 8. Totals card (PdfService lines 696-779)
  //    - Subtotal
  //    - Discount (if any)
  //    - HST / GST / PST (show only non-zero taxes, label by province)
  //    - TOTAL CREDIT (emphasized, larger font)

  // 9. Authorization section
  //    - "Authorized By:" [issued_by name]
  //    - "Date Issued:" [issued_at]
  //    - "Application Method:" [if applied]

  // 10. Footer (PdfService lines 984-1024)
  //     - "This document is a credit memo issued by [Company Name]"
  //     - Page numbers

  doc.end();
  return Buffer.concat(chunks);
}
```

**Step 2: Test PDF generation manually**

Run: `node -e "..." ` (script that creates a test credit memo and generates PDF to verify it renders)
Expected: PDF buffer created, file writable to disk for visual inspection.

**Step 3: Commit**

```bash
git add backend/services/CreditMemoService.js
git commit -m "feat: Add CRA-compliant credit memo PDF generation"
```

---

## Task 4: Extend OrderModificationService — Past-Order Editing + Auto Credit Memo

**Files:**
- Modify: `backend/services/OrderModificationService.js`
  - After line 19 (constructor): add `this.creditMemoService = null;` and `setCreditMemoService(svc)` method
  - After line 779 (`_recalculateOrderTotals`): add `getAmendableOrder` method
  - Lines 594-714 (`applyAmendment`): add credit memo auto-generation after line 699 (after amendment status update, before COMMIT)

**Step 1: Add CreditMemoService dependency injection**

After the constructor (line 19), add:

```javascript
setCreditMemoService(creditMemoService) {
  this.creditMemoService = creditMemoService;
}
```

**Step 2: Add `getAmendableOrder` method**

After `_recalculateOrderTotals` (after line 779), add a method that fetches order + items + payments + amendments regardless of order status. This is for admin/manager use — no status gate.

```javascript
async getAmendableOrder(orderId) {
  const orderResult = await this.pool.query(
    `SELECT o.*, c.first_name || ' ' || c.last_name as customer_name, c.email as customer_email
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.order_id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) return null;

  const itemsResult = await this.pool.query(
    `SELECT oi.*, p.sku, p.name as current_product_name
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  const amendmentsResult = await this.pool.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name as created_by_name
     FROM order_amendments a
     LEFT JOIN users u ON a.created_by = u.id
     WHERE a.order_id = $1
     ORDER BY a.created_at DESC`,
    [orderId]
  );

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows,
    amendments: amendmentsResult.rows,
  };
}
```

**Step 3: Add auto credit memo generation in `applyAmendment`**

Inside `applyAmendment` (around line 699, after the amendment status UPDATE and before COMMIT on line 701):

```javascript
// Auto-generate credit memo if amendment reduced order total
if (amendment.difference_cents < 0 && this.creditMemoService) {
  try {
    await this.creditMemoService.createFromAmendment(amendmentId, userId);
  } catch (cmError) {
    // Log but don't fail the amendment application
    console.error('Credit memo auto-generation failed:', cmError.message);
  }
}
```

**Step 4: Verify service loads**

Run: `node -e "const S = require('./backend/services/OrderModificationService'); const s = new S({}); console.log('getAmendableOrder' in s, 'setCreditMemoService' in s)"`
Expected: `true true`

**Step 5: Commit**

```bash
git add backend/services/OrderModificationService.js
git commit -m "feat: Extend OrderModificationService with past-order editing and auto credit memo"
```

---

## Task 5: Credit Memo API Routes

**Files:**
- Create: `backend/routes/credit-memos.js`
- Modify: `backend/server.js`
  - Line ~181 (after other `{ init }` imports): add `const { init: initCreditMemoRoutes } = require('./routes/credit-memos');`
  - After line ~2948 (enterprise routes section): add `app.use('/api/credit-memos', initCreditMemoRoutes({ pool, cache }));`

**Step 1: Write the routes file**

Follow the `{ init }` pattern from `backend/routes/order-modifications.js` (lines 7-12, 18-20, 548-555).

```javascript
/**
 * TeleTime - Credit Memo Routes
 *
 * CRA-compliant credit memo endpoints with permission-gated access
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const CreditMemoService = require('../services/CreditMemoService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

let pool = null;
let cache = null;
let creditMemoService = null;

// GET /api/credit-memos/reason-codes
// Must be defined BEFORE /:id route to avoid param conflict
router.get('/reason-codes',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT code, label, description FROM credit_memo_reason_codes WHERE active = true ORDER BY sort_order'
    );
    res.json({ success: true, data: result.rows });
  })
);

// GET /api/credit-memos/order/:orderId
router.get('/order/:orderId',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const memos = await creditMemoService.listByOrder(parseInt(req.params.orderId));
    res.json({ success: true, data: memos });
  })
);

// GET /api/credit-memos
router.get('/',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status,
      customerId: req.query.customerId ? parseInt(req.query.customerId) : undefined,
      orderId: req.query.orderId ? parseInt(req.query.orderId) : undefined,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    };
    const result = await creditMemoService.listAll(filters);
    res.json({ success: true, ...result });
  })
);

// GET /api/credit-memos/:id
router.get('/:id',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const memo = await creditMemoService.getById(parseInt(req.params.id));
    if (!memo) throw ApiError.notFound('Credit memo not found');
    res.json({ success: true, data: memo });
  })
);

// POST /api/credit-memos (manual creation)
router.post('/',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      orderId: Joi.number().integer().required(),
      reason: Joi.string().required(),
      reasonCode: Joi.string().required(),
      internalNotes: Joi.string().allow('', null),
      lines: Joi.array().items(Joi.object({
        productId: Joi.number().integer().required(),
        productSku: Joi.string().allow('', null),
        productName: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        originalUnitPriceCents: Joi.number().integer().required(),
        creditedUnitPriceCents: Joi.number().integer().required(),
        description: Joi.string().allow('', null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest(error.details[0].message);

    const memo = await creditMemoService.createManual(value.orderId, value, req.user.userId);
    res.status(201).json({ success: true, data: memo });
  })
);

// POST /api/credit-memos/:id/issue
router.post('/:id/issue',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    const memo = await creditMemoService.issue(parseInt(req.params.id), req.user.userId);
    res.json({ success: true, data: memo });
  })
);

// POST /api/credit-memos/:id/apply
router.post('/:id/apply',
  authenticate,
  checkPermission('credit_memos.apply'),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      applicationMethod: Joi.string().valid('refund_to_original', 'store_credit', 'manual_adjustment').required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest(error.details[0].message);

    const memo = await creditMemoService.apply(parseInt(req.params.id), value.applicationMethod, req.user.userId);
    res.json({ success: true, data: memo });
  })
);

// POST /api/credit-memos/:id/void
router.post('/:id/void',
  authenticate,
  checkPermission('credit_memos.void'),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({ reason: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest(error.details[0].message);

    const memo = await creditMemoService.void(parseInt(req.params.id), value.reason, req.user.userId);
    res.json({ success: true, data: memo });
  })
);

// GET /api/credit-memos/:id/pdf
router.get('/:id/pdf',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const pdfBuffer = await creditMemoService.generatePdf(parseInt(req.params.id));
    const memo = await creditMemoService.getById(parseInt(req.params.id));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="CreditMemo_${memo.credit_memo_number || memo.id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  })
);

// POST /api/credit-memos/:id/email
router.post('/:id/email',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    await creditMemoService.emailCreditMemo(parseInt(req.params.id));
    res.json({ success: true, message: 'Credit memo emailed successfully' });
  })
);

// INITIALIZATION
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  creditMemoService = new CreditMemoService(pool, cache);
  return router;
};

module.exports = { init };
```

**Step 2: Register routes in server.js**

Add import at line ~181 (after `initAudienceSyncRoutes`):

```javascript
const { init: initCreditMemoRoutes } = require('./routes/credit-memos');
```

Add mounting after the enterprise routes section (after line ~2948):

```javascript
app.use('/api/credit-memos', initCreditMemoRoutes({ pool, cache }));
logger.info('Credit memo routes loaded');
```

**Step 3: Also register order-modifications routes** (currently NOT mounted in server.js)

Add import at line ~181:

```javascript
const { init: initOrderModificationRoutes } = require('./routes/order-modifications');
```

Add mounting:

```javascript
app.use('/api/order-modifications', initOrderModificationRoutes({ pool, cache }));
logger.info('Order modification routes loaded');
```

**Step 4: Wire CreditMemoService into OrderModificationService**

In the order-modifications `init()` function, after creating modificationService, wire the credit memo service:

```javascript
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  modificationService = new OrderModificationService(pool, cache);
  // Wire credit memo auto-generation
  const CreditMemoService = require('../services/CreditMemoService');
  const creditMemoService = new CreditMemoService(pool, cache);
  modificationService.setCreditMemoService(creditMemoService);
  return router;
};
```

**Step 5: Verify server starts**

Run: `cd backend && node -e "require('./server')" ` (or check startup log for "Credit memo routes loaded")
Expected: Server starts without errors, new routes registered.

**Step 6: Commit**

```bash
git add backend/routes/credit-memos.js backend/server.js backend/routes/order-modifications.js
git commit -m "feat: Add credit memo routes and register order-modification/credit-memo endpoints"
```

---

## Task 6: Back Office — PendingAmendments Dashboard

**Files:**
- Create: `frontend/src/components/orders/PendingAmendments.jsx`
- Modify: `frontend/src/App.js`
  - Line ~76 (lazy imports): add `const PendingAmendments = React.lazy(() => import('./components/orders/PendingAmendments'));`
  - After line 648 (after product-variants route): add route for `/admin/pending-amendments`

**Step 1: Write PendingAmendments component**

Key implementation:

```jsx
import React, { useState, useEffect, useCallback } from 'react';

// Columns: Amendment #, Order #, Customer, Requested By, Date, Type, Financial Impact, Actions
// Features:
// - Fetches from GET /api/order-modifications/amendments/pending
// - Sort by date (default) or financial impact
// - Filter by date range, amendment type, requested-by user
// - Inline approve button → POST /api/order-modifications/amendments/:id/approve
// - Reject button → opens modal for reason → POST /api/order-modifications/amendments/:id/reject
// - "View Order" quick-link on each row → window.open or modal preview
// - Badge count in header showing total pending
// - Loading/empty states
// - Format money: (cents / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
```

**Step 2: Register route in App.js**

Add lazy import after line ~76:
```javascript
const PendingAmendments = React.lazy(() => import('./components/orders/PendingAmendments'));
```

Add route after line 648 (after product-variants):
```jsx
<Route path="/admin/pending-amendments" element={
  <ProtectedRoute requiredRoles={['admin', 'manager']}>
    <PendingAmendments />
  </ProtectedRoute>
} />
```

**Step 3: Verify route renders**

Run: Start frontend dev server, navigate to `/admin/pending-amendments` as admin.
Expected: Dashboard renders with empty/loading state.

**Step 4: Commit**

```bash
git add frontend/src/components/orders/PendingAmendments.jsx frontend/src/App.js
git commit -m "feat: Add PendingAmendments dashboard with approve/reject workflow"
```

---

## Task 7: Back Office — AmendmentTimeline Component

**Files:**
- Create: `frontend/src/components/orders/AmendmentTimeline.jsx`

**Step 1: Write AmendmentTimeline component**

```jsx
import React, { useState, useEffect } from 'react';

// Props: { orderId }
// Fetches: GET /api/order-modifications/:orderId/amendments
// Also fetches: GET /api/credit-memos/order/:orderId (to link credit memos inline)
//
// Renders vertical timeline:
// - Each entry: version dot → timestamp → who (name + role) → amendment type badge
// - Financial impact: green (+$X.XX) or red (-$X.XX)
// - Status badge: draft (gray), pending_approval (amber), approved (blue),
//                 rejected (red), applied (green), cancelled (gray)
// - Expandable detail section (click to toggle):
//   - Item-level changes list (added/removed/modified with quantities and prices)
//   - Linked credit memo with number and status (clickable to view/download PDF)
// - Timeline line connecting dots vertically
// - Empty state: "No amendments yet"
```

**Step 2: Commit**

```bash
git add frontend/src/components/orders/AmendmentTimeline.jsx
git commit -m "feat: Add AmendmentTimeline component with expandable detail and credit memo links"
```

---

## Task 8: Back Office — OrderEditModal

**Files:**
- Create: `frontend/src/components/orders/OrderEditModal.jsx`

**Step 1: Write OrderEditModal component**

This is the largest frontend component. Full-screen modal.

```jsx
import React, { useState, useEffect, useCallback } from 'react';

// Props: { orderId, isOpen, onClose, onAmendmentCreated }
//
// STATE:
// - order (fetched from GET /api/order-modifications/:orderId)
// - editedItems (copy of order items with local edits)
// - pendingChanges (array of { changeType, productId, ... })
// - reason (string, required for submit)
// - submitting (boolean)
// - productSearch (string, for adding new items)
// - searchResults (products matching search)
//
// LAYOUT (full-screen modal with overlay):
// ┌────────────────────────────────────────────────────┐
// │ [X] Edit Order #ORD-001234 — John Smith — Completed│
// ├───────────────────────────┬────────────────────────┤
// │ LINE ITEMS                │ ORDER SUMMARY          │
// │ ┌─────────────────────┐   │ Subtotal:    $1,234.00 │
// │ │ SKU | Name | Qty|$  │   │ Discount:      -$50.00 │
// │ │ [editable qty/price] │   │ Tax (ON HST):  $153.92 │
// │ │ [remove button]      │   │ ─────────────────────  │
// │ │ ...                  │   │ NEW TOTAL:   $1,337.92 │
// │ └─────────────────────┘   │ Original:    $1,500.00 │
// │ [+ Add Product]           │ Delta:         -$162.08 │
// │                           │                        │
// │ PENDING CHANGES           │ [AmendmentTimeline]    │
// │ ● Modified: TV 65" (2→1) │                        │
// │ ● Removed: HDMI Cable     │                        │
// ├───────────────────────────┴────────────────────────┤
// │ Reason: [________________________] [Submit Draft] [Submit for Approval] │
// └────────────────────────────────────────────────────┘
//
// BEHAVIOR:
// - Qty change: update editedItems, add to pendingChanges
// - Price change: update editedItems, add to pendingChanges
// - Remove: mark item in pendingChanges as 'remove'
// - Add product: search products via GET /api/products?search=..., add to pendingChanges
// - Running totals recalculate client-side (subtotal from edited items, tax at province rate)
// - Submit: POST /api/order-modifications/:orderId/amendments with changes array
// - Permission check: only show price editing for admin/manager
// - AmendmentTimeline embedded in right panel (reuse Task 7 component)
```

**Step 2: Commit**

```bash
git add frontend/src/components/orders/OrderEditModal.jsx
git commit -m "feat: Add OrderEditModal with full line-item editing and amendment submission"
```

---

## Task 9: POS Enhancement — Simplified Amendment Form

**Files:**
- Modify: `apps/pos/src/components/OrderModification/OrderModificationPanel.jsx`
  - Add a "Create Quick Amendment" section in the Items tab
  - Limited to: quantity changes and line removals ONLY (no adding products)
  - Add credit memo indicator badge on amendments that generated a credit memo

**Step 1: Read the current component fully to find insertion points**

Read the entire `OrderModificationPanel.jsx` to identify:
- Where the Items tab content ends
- Where amendments are rendered
- The existing state management pattern

**Step 2: Add quick amendment form**

In the Items tab, after the existing item list, add:

```jsx
{/* Quick Amendment — POS limited to qty changes and line removals */}
{showQuickAmend && (
  <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
    <h4>Create Amendment</h4>
    {/* For each item, show current qty + editable qty field + remove checkbox */}
    {/* Reason input (required) */}
    {/* Submit button → POST /api/order-modifications/:orderId/amendments */}
    {/* Only changeType: 'modify' (qty) and 'remove' — no 'add' */}
  </div>
)}
```

**Step 3: Add credit memo indicator**

In the Amendments tab, where amendment cards are rendered, add a badge when the amendment has an associated credit memo:

```jsx
{amendment.creditMemoId && (
  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
    Credit Memo
  </span>
)}
```

**Step 4: Commit**

```bash
git add apps/pos/src/components/OrderModification/OrderModificationPanel.jsx
git commit -m "feat: Add POS quick amendment form (qty/remove only) and credit memo indicator"
```

---

## Task 10: Integration Wiring & Smoke Test

**Files:**
- Modify: `backend/routes/order-modifications.js` (wire CreditMemoService in init)
- Verify all route registrations in `backend/server.js`

**Step 1: Verify all backend routes load**

Run: `cd backend && node -e "
const express = require('express');
const app = express();
console.log('Routes check:');
console.log('- CreditMemoService:', typeof require('./services/CreditMemoService'));
console.log('- OrderModificationService:', typeof require('./services/OrderModificationService'));
console.log('- credit-memos routes:', typeof require('./routes/credit-memos').init);
console.log('- order-modifications routes:', typeof require('./routes/order-modifications').init);
console.log('All OK');
"`
Expected: All four checks return `function`, final line says `All OK`.

**Step 2: Run API smoke test**

```bash
# Login as admin
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@yourcompany.com","password":"TestPass123!"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.accessToken))")

# Get reason codes
curl -s http://localhost:3001/api/credit-memos/reason-codes \
  -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"

# List credit memos (should be empty)
curl -s http://localhost:3001/api/credit-memos \
  -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"

# List pending amendments
curl -s http://localhost:3001/api/order-modifications/amendments/pending \
  -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)))"
```

Expected: All return `{ success: true, ... }` responses.

**Step 3: Test frontend routes**

- Navigate to `http://localhost:3000/admin/pending-amendments` as admin → PendingAmendments renders
- Open any order detail → AmendmentTimeline renders (empty state)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Complete order amendment system integration with credit memos"
```

---

## Summary

| Task | Component | Estimated Complexity |
|------|-----------|---------------------|
| 1 | Migration 155 (SQL) | Low |
| 2 | CreditMemoService (core logic) | High |
| 3 | Credit Memo PDF generation | Medium |
| 4 | Extend OrderModificationService | Medium |
| 5 | Credit memo routes + server wiring | Medium |
| 6 | PendingAmendments dashboard | Medium |
| 7 | AmendmentTimeline component | Medium |
| 8 | OrderEditModal | High |
| 9 | POS quick amendment form | Low |
| 10 | Integration wiring & smoke test | Low |

**Dependencies:**
- Task 1 must complete first (database)
- Tasks 2-3 depend on Task 1
- Task 4 depends on Task 2
- Task 5 depends on Tasks 2-4
- Tasks 6-8 can run in parallel after Task 5
- Task 9 can run after Task 5
- Task 10 runs last
