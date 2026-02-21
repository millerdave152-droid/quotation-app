# Fix Plan: 3 POS Error Patterns

## Issue 1: `GET /api/customer-pricing/info/:id` — Route Not Found

**Root cause**: `backend/routes/customer-pricing.js` exists with a proper `init({ pool, cache })` export, but it was **never mounted** in `server.js`. Every call returns 404.

**Fix** (1 file):
- `backend/server.js` — Add route import + mount:
  ```js
  const customerPricingRoutes = require('./routes/customer-pricing');
  app.use('/api/customer-pricing', customerPricingRoutes.init({ pool, cache }));
  ```
  Place it near the other pricing-related routes (around the price-imports / price-history block).

---

## Issue 2: `POST /api/pos-payments/card/create-intent` — "transactionId must be a number"

**Root cause**: `CheckoutModal` renders `<CardPayment>` without passing `transactionId` (the transaction doesn't exist yet — it's created *after* payment completes). `CardPayment` defaults `transactionId = null` and sends `{ transactionId: null }` in the request body. Joi schema `Joi.number().integer().optional()` rejects `null`.

**Fix** (2 files):
1. `backend/routes/pos-payments.js` line 23 — Add `.allow(null)`:
   ```js
   transactionId: Joi.number().integer().allow(null).optional(),
   ```
2. `apps/pos/src/components/Checkout/CardPayment.jsx` line 87-92 — Filter out null values before sending:
   ```js
   body: JSON.stringify({
     amountCents,
     ...(customerId != null && { customerId }),
     ...(transactionId != null && { transactionId }),
     description: `POS ${paymentType} payment`,
   }),
   ```

---

## Issue 3: `POST /api/transactions` — Missing streetNumber/streetName/city/postalCode

**Root cause**: Saved customer addresses may only have a combined `street` field (e.g. "123 Main St") without separate `streetNumber`/`streetName`. The backend Joi schema requires these as non-empty strings. The existing uncommitted diffs in CartContext.jsx and DeliveryAddressForm.jsx already add `normalizeAddress()` to parse `street` into parts — but the regex fallback can produce empty strings (e.g. street "Main St" with no leading number), which Joi still rejects.

**Fix** (1 file — the frontend normalization in the diff is already solid):
- `backend/routes/transactions.js` lines 108-120 — Make the address sub-schema conditional: when address is provided with a delivery/shipping type, require the fields but `.allow('')` so edge cases don't 400. Also strip empty address for pickup types:
  ```js
  address: Joi.object({
    streetNumber: Joi.string().allow('').required(),
    streetName: Joi.string().allow('').required(),
    street: Joi.string().allow('').optional(),
    unit: Joi.string().allow(null, '').optional(),
    buzzer: Joi.string().allow(null, '').optional(),
    city: Joi.string().allow('').required(),
    province: Joi.string().length(2).uppercase().required(),
    postalCode: Joi.string().pattern(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i).allow('').required(),
    ...
  }).allow(null).optional(),
  ```

  Actually, `.allow('')` on `postalCode` with a pattern is contradictory. Better approach: make `address` **only required when type is delivery/shipping** using Joi `.when()`:
  ```js
  address: Joi.object({
    streetNumber: Joi.string().required(),
    streetName: Joi.string().required(),
    ...
  }).when('type', {
    is: Joi.valid('local_delivery', 'shipping'),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null),
  })
  ```
  This keeps strict validation for delivery but allows null/absent for pickup.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `backend/server.js` | Mount customer-pricing route |
| `backend/routes/pos-payments.js` | Allow null transactionId in Joi schema |
| `backend/routes/transactions.js` | Conditional address validation based on fulfillment type |
| `apps/pos/src/components/Checkout/CardPayment.jsx` | Don't send null transactionId/customerId |

The existing uncommitted diffs (CartContext.jsx, DeliveryAddressForm.jsx, transactions.js API) are **kept as-is** — they provide good frontend normalization that complements the backend fixes.
