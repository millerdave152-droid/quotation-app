# Order Amendment System — Design Document

**Date:** 2026-02-27
**Approach:** Extend existing OrderModificationService + add Credit Memo system

## Context

TeleTime Solutions needs full order editing with audit trail, role-based access, and CRA-compliant credit memos. Allows ownership to edit any past order at any time while maintaining a paper trail for year-end tax reconciliation.

The existing codebase already has: `order_amendments`, `order_amendment_items`, `order_versions` tables (migrations 004 + 008), `OrderModificationService` with create/approve/reject/apply workflow, 18 API endpoints, and `OrderModificationPanel` in POS.

## Decisions

- **Approach:** Extend existing system (not replace or parallel)
- **Money format:** Cents-based integers (matching existing pattern)
- **Access control:** Admin + Manager have full edit access to any order; other roles need approval
- **UI placement:** Full editing in Back Office + simplified amendments in POS (qty changes and line removals only)
- **Credit memos:** Full CRA compliance with PDF generation, sequential numbering, HST/GST/PST breakdown

---

## 1. Database — Migration 155

### New lookup table: `credit_memo_reason_codes`

| Column | Type | Notes |
|--------|------|-------|
| code | VARCHAR PK | e.g., price_adjustment, item_return |
| label | VARCHAR NOT NULL | Display name |
| description | TEXT | Help text |
| active | BOOLEAN DEFAULT true | Soft delete |
| sort_order | INTEGER DEFAULT 0 | Display ordering |

Seeded with: price_adjustment, item_return, order_cancellation, quantity_change, billing_error, goodwill.

### New table: `credit_memos`

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| credit_memo_number | VARCHAR UNIQUE | Sequential: CM-000001 |
| order_id | INT FK → unified_orders(id) | |
| amendment_id | INT FK → order_amendments(id) | Nullable — links to triggering amendment |
| original_invoice_number | VARCHAR | For CRA reference |
| customer_id | INT FK → customers(id) | |
| reason | TEXT | Customer-facing reason |
| internal_notes | TEXT | Internal-only notes |
| reason_code | VARCHAR FK → credit_memo_reason_codes(code) | |
| subtotal_cents | INT NOT NULL | |
| discount_cents | INT DEFAULT 0 | |
| hst_cents | INT DEFAULT 0 | |
| gst_cents | INT DEFAULT 0 | |
| pst_cents | INT DEFAULT 0 | |
| tax_total_cents | INT DEFAULT 0 | |
| total_cents | INT NOT NULL | |
| province | VARCHAR(2) | For tax breakdown |
| status | ENUM(draft, issued, applied, voided) | |
| application_method | VARCHAR | refund_to_original, store_credit, manual_adjustment |
| issued_at | TIMESTAMPTZ | |
| issued_by | INT FK → users(id) | |
| applied_at | TIMESTAMPTZ | |
| applied_by | INT FK → users(id) | |
| voided_at | TIMESTAMPTZ | |
| voided_by | INT FK → users(id) | |
| void_reason | TEXT | |
| pdf_url | TEXT | |
| created_by | INT FK → users(id) | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ DEFAULT NOW() | |

### New table: `credit_memo_lines`

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| credit_memo_id | INT FK → credit_memos(id) ON DELETE CASCADE | |
| line_number | INT NOT NULL | PDF rendering order |
| product_id | INT FK → products(id) | |
| product_sku | VARCHAR | |
| product_name | VARCHAR | |
| quantity | INT | |
| original_unit_price_cents | INT | |
| credited_unit_price_cents | INT | |
| discount_cents | INT DEFAULT 0 | |
| tax_rate | NUMERIC(5,4) | |
| tax_cents | INT DEFAULT 0 | |
| line_total_cents | INT NOT NULL | |
| description | TEXT | Line-level note |

### New permissions

- `orders.amend` — create amendments on own orders
- `orders.amend.any` — create amendments on any order (admin + manager)
- `orders.amend.approve` — approve/reject amendments
- `credit_memos.create` — create and issue credit memos
- `credit_memos.view` — view credit memos and PDFs
- `credit_memos.apply` — apply credit memos (separate from create)
- `credit_memos.void` — void issued/applied credit memos

### Trigger

Auto-increment `credit_memo_number` via PostgreSQL sequence.

---

## 2. Backend Services

### 2a. Extend OrderModificationService

- **`amendPastOrder(orderId, userId, changes, options)`** — Edit completed/voided orders. Requires `orders.amend.any`. Creates version snapshot before changes.
- **`getAmendableOrder(orderId)`** — Returns order with items/payments/history regardless of status (for admin/manager).
- **Auto credit memo on apply** — When `applyAmendment()` detects negative `difference_cents`, triggers `CreditMemoService.createFromAmendment()` which calculates line-level deltas (price diff x qty, not full line copies).

### 2b. New CreditMemoService

| Method | Purpose |
|--------|---------|
| `createFromAmendment(amendmentId, userId)` | Auto-creates from amendment with line-level deltas. Tax by province. Status=draft. |
| `createManual(orderId, lines, reason, userId)` | Manual creation (e.g., goodwill) |
| `issue(creditMemoId, userId)` | Assigns sequential number, status=issued |
| `apply(creditMemoId, applicationMethod, userId)` | Applies memo. applicationMethod: refund_to_original, store_credit, manual_adjustment |
| `void(creditMemoId, reason, userId)` | Voids with reason |
| `generatePdf(creditMemoId)` | CRA-compliant PDF |
| `emailCreditMemo(creditMemoId)` | Email via existing SES patterns |
| `getById(id)` | Full memo with lines |
| `listByOrder(orderId)` | All memos for an order |
| `listAll(filters)` | Filtered list for dashboard |

### 2c. Credit Memo PDF

Follows PdfService/POSInvoiceService visual patterns:
- Same color scheme (#1e40af primary, zebra striping)
- Same header layout (company info, accent bar)
- **"CREDIT MEMO"** badge (not "QUOTATION" or "INVOICE")
- **Both original order number AND invoice number** in header
- Customer card (BILL TO)
- Line items: Line #, SKU, Description, Qty, Original Price, Credited Price, Line Total
- Tax breakdown: Subtotal, HST/GST/PST per province, Total Credit
- Sequential credit memo number
- Issued date, reason, authorized by
- Footer: "This document is a credit memo issued by [Company]"

---

## 3. API Routes — `routes/credit-memos.js`

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | /api/credit-memos | credit_memos.create |
| GET | /api/credit-memos | credit_memos.view |
| GET | /api/credit-memos/:id | credit_memos.view |
| GET | /api/credit-memos/order/:orderId | credit_memos.view |
| POST | /api/credit-memos/:id/issue | credit_memos.create |
| POST | /api/credit-memos/:id/apply | credit_memos.apply |
| POST | /api/credit-memos/:id/void | credit_memos.void |
| GET | /api/credit-memos/:id/pdf | credit_memos.view |
| POST | /api/credit-memos/:id/email | credit_memos.create |
| GET | /api/credit-memos/reason-codes | credit_memos.view |

Existing order-modifications routes unchanged — service-layer changes are transparent.

---

## 4. Frontend — Back Office

### 4a. OrderEditModal (`frontend/src/components/orders/OrderEditModal.jsx`)

Full-screen modal for editing any order.
- **Header:** Order number, customer name, status badge, original total
- **Left panel:** Editable line items table (qty, price, remove, add new products)
- **Right panel:** Running totals (subtotal, discount, tax, new total, delta)
- **Bottom bar:** Reason input (required), submit as draft or submit for approval
- **Permission gating:** Admin/manager see all orders; others see own editable orders only

### 4b. AmendmentTimeline (`frontend/src/components/orders/AmendmentTimeline.jsx`)

Vertical timeline per order.
- Version number + timestamp
- Who + role
- Amendment type badge
- Financial impact (color-coded +/-)
- Status badge (approved/rejected/pending/applied)
- Expandable detail: item changes, credit memo link
- Linked credit memos inline

### 4c. PendingAmendments (`frontend/src/components/orders/PendingAmendments.jsx`)

Dashboard at `/admin/pending-amendments`.
- Table: Amendment #, Order #, Customer, Requested By, Date, Type, Financial Impact, Actions
- **"View Order" quick-link/preview** on each row
- Sort by date or financial impact
- Inline approve/reject with reason modal
- Filter by date range, type, user
- Badge count in sidebar for pending count

### 4d. Route: `/admin/pending-amendments` (lazy loaded, protected)

---

## 5. POS Enhancement

Extend existing `OrderModificationPanel.jsx`:
- **"Create Amendment" button** — simplified inline form
- **Limited to quantity changes and line removals only** — no adding products from POS
- **Credit memo indicator** — badge when amendment generated a credit memo
- **Amendment timeline** — reuse or adapt AmendmentTimeline component
- **Approval notifications** — toast when amendment approved/rejected
