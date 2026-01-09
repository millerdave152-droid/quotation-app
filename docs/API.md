# QuotationApp API Documentation

This document provides comprehensive documentation for all backend API endpoints.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Customers](#customers)
4. [Products](#products)
5. [Quotes](#quotes)
6. [Orders](#orders)
7. [Invoices](#invoices)
8. [Inventory](#inventory)
9. [Delivery](#delivery)
10. [Pricing](#pricing)
11. [Advanced Pricing](#advanced-pricing)
12. [Stripe Payments](#stripe-payments)
13. [Customer Payments](#customer-payments)
14. [Categories](#categories)
15. [Analytics](#analytics)
16. [Product Metrics](#product-metrics)
17. [Notifications](#notifications)
18. [Push Notifications](#push-notifications)
19. [Activities](#activities)
20. [Follow-up](#follow-up)
21. [Package Builder](#package-builder)
22. [Package Builder V2](#package-builder-v2)
23. [AI Personalization](#ai-personalization)
24. [Counter Offers](#counter-offers)
25. [Vendor Products](#vendor-products)
26. [3D Product Models](#3d-product-models)
27. [Import Templates](#import-templates)
28. [API Keys](#api-keys)
29. [Quote Protection](#quote-protection)
30. [2026 Features](#2026-features)
31. [Marketplace](#marketplace)

---

## Authentication

Base path: `/api/auth`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/login` | User login | `email`, `password` |
| POST | `/register` | Register new user | `email`, `password`, `firstName`, `lastName` |
| POST | `/logout` | Logout user | - |
| GET | `/me` | Get current user | - |
| POST | `/refresh` | Refresh auth token | - |
| POST | `/forgot-password` | Request password reset | `email` |
| POST | `/reset-password` | Reset password with token | `token`, `password` |

---

## Users

Base path: `/api/users`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List all users | `search`, `role`, `active`, `limit`, `offset` |
| GET | `/:id` | Get user by ID | - |
| POST | `/` | Create new user | `email`, `password`, `firstName`, `lastName`, `role` |
| PUT | `/:id` | Update user | User fields |
| DELETE | `/:id` | Delete user | - |
| PUT | `/:id/password` | Change password | `currentPassword`, `newPassword` |
| GET | `/salespeople` | Get salespeople list | - |

---

## Customers

Base path: `/api/customers`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List customers with pagination | `search`, `sortBy`, `sortOrder`, `limit`, `offset` |
| GET | `/stats/overview` | Customer statistics overview | - |
| GET | `/lifetime-value` | CLV summary for all customers | `limit`, `segment`, `sortBy`, `sortOrder` |
| GET | `/:id` | Get customer with quote history | - |
| GET | `/:id/lifetime-value` | Get CLV for specific customer | - |
| POST | `/` | Create new customer | `name`, `email`, `phone`, `address` |
| PUT | `/:id` | Update customer | Customer fields |
| DELETE | `/:id` | Delete customer | - |

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Customer Name",
    "email": "email@example.com",
    "lifetimeValue": {
      "totalRevenue": 50000,
      "orderCount": 10,
      "segment": "gold",
      "churnRisk": "low"
    }
  }
}
```

---

## Products

Base path: `/api/products`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List products with filters | `search`, `category`, `manufacturer`, `active`, `sortBy`, `limit`, `offset` |
| GET | `/search` | Search products | `q`, `category`, `limit` |
| GET | `/categories` | Get product categories | - |
| GET | `/manufacturers` | Get manufacturers list | - |
| GET | `/stats` | Product statistics | - |
| GET | `/favorites` | Get user's favorite products | - |
| GET | `/:id` | Get product details | - |
| POST | `/` | Create product | Product fields |
| PUT | `/:id` | Update product | Product fields |
| DELETE | `/:id` | Delete product | - |
| POST | `/:id/favorite` | Add to favorites | - |
| DELETE | `/:id/favorite` | Remove from favorites | - |
| POST | `/import/csv` | Import from CSV | File upload |
| POST | `/import/excel` | Import from Excel | File upload |
| GET | `/export/csv` | Export to CSV | Filters |
| POST | `/:id/tags` | Add tags to product | `tags[]` |
| DELETE | `/:id/tags/:tagId` | Remove tag | - |

---

## Quotes

Base path: `/api/quotes`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List quotations | `status`, `customerId`, `salesperson`, `search`, `limit`, `offset` |
| GET | `/stats` | Quote statistics | `period` |
| GET | `/expiring` | Get expiring quotes | `days` |
| GET | `/:id` | Get quote with items | - |
| POST | `/` | Create quote | Quote fields |
| PUT | `/:id` | Update quote | Quote fields |
| DELETE | `/:id` | Delete quote | - |
| POST | `/:id/items` | Add item to quote | `productId`, `quantity`, `sellPriceCents` |
| PUT | `/:id/items/:itemId` | Update quote item | Item fields |
| DELETE | `/:id/items/:itemId` | Remove item | - |
| POST | `/:id/send` | Send quote to customer | `emailTo`, `message` |
| POST | `/:id/duplicate` | Duplicate quote | - |
| GET | `/:id/versions` | Get version history | - |
| POST | `/:id/version` | Create new version | `notes` |
| GET | `/:id/events` | Get quote events | - |
| GET | `/:id/pdf` | Generate PDF | `format` |

### Quote Delivery
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/delivery` | Get delivery details | - |
| POST | `/:id/delivery` | Set delivery options | Delivery fields |
| PUT | `/:id/delivery` | Update delivery | Delivery fields |

### Quote Warranties
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/warranties` | Get warranties | - |
| POST | `/:id/warranties` | Add warranty | Warranty fields |
| DELETE | `/:id/warranties/:warrantyId` | Remove warranty | - |

### Quote Financing
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/financing` | Get financing details | - |
| POST | `/:id/financing` | Add financing | Financing fields |
| PUT | `/:id/financing` | Update financing | - |

### Quote Rebates
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/rebates` | Get rebates | - |
| POST | `/:id/rebates` | Add rebate | Rebate fields |
| DELETE | `/:id/rebates/:rebateId` | Remove rebate | - |

### Quote Trade-ins
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/trade-ins` | Get trade-ins | - |
| POST | `/:id/trade-ins` | Add trade-in | Trade-in fields |
| DELETE | `/:id/trade-ins/:tradeInId` | Remove trade-in | - |

### Quote Signatures
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:id/signatures` | Get signatures | - |
| POST | `/:id/signatures` | Add signature | Signature data |

---

## Orders

Base path: `/api/orders`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List orders | `status`, `customerId`, `limit`, `offset` |
| GET | `/:id` | Get order details | - |
| POST | `/` | Create order | Order fields |
| PUT | `/:id` | Update order | Order fields |
| PUT | `/:id/status` | Update order status | `status` |
| POST | `/from-quote/:quoteId` | Convert quote to order | - |

---

## Invoices

Base path: `/api/invoices`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List invoices | `status`, `customerId`, `limit`, `offset` |
| GET | `/:id` | Get invoice details | - |
| POST | `/` | Create invoice | Invoice fields |
| PUT | `/:id` | Update invoice | Invoice fields |
| POST | `/:id/payments` | Record payment | `amountCents`, `method` |
| GET | `/:id/payments` | Get payment history | - |

---

## Inventory

Base path: `/api/inventory`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List inventory | `productId`, `location` |
| GET | `/:productId` | Get product inventory | - |
| PUT | `/:productId` | Update stock level | `quantity`, `location` |
| POST | `/:productId/adjust` | Adjust inventory | `adjustment`, `reason` |
| GET | `/low-stock` | Get low stock items | `threshold` |
| GET | `/reservations` | List reservations | `quoteId` |
| POST | `/reservations` | Create reservation | `productId`, `quantity`, `quoteId` |
| DELETE | `/reservations/:id` | Cancel reservation | - |

---

## Delivery

Base path: `/api/delivery`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/zones` | List delivery zones | - |
| GET | `/zones/:id` | Get zone details | - |
| POST | `/zones` | Create zone | Zone fields |
| PUT | `/zones/:id` | Update zone | Zone fields |
| DELETE | `/zones/:id` | Delete zone | - |
| GET | `/slots` | Get available slots | `zoneId`, `date` |
| POST | `/slots` | Create time slot | Slot fields |
| PUT | `/slots/:id` | Update slot | Slot fields |
| DELETE | `/slots/:id` | Delete slot | - |
| GET | `/bookings` | List bookings | `date`, `zoneId` |
| POST | `/bookings` | Create booking | Booking fields |
| PUT | `/bookings/:id` | Update booking | Booking fields |
| DELETE | `/bookings/:id` | Cancel booking | - |
| POST | `/calculate` | Calculate delivery cost | `zoneId`, `items` |

---

## Pricing

Base path: `/api/pricing`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/tiers` | Get customer pricing tiers | - |
| GET | `/:productId` | Get price points for product | - |
| GET | `/:productId/margins` | Calculate margins | `sellPrice` |
| POST | `/:productId/simulate` | Simulate margin | `proposedPriceCents` |
| POST | `/:productId/check-violations` | Check price violations | `sellPriceCents` |
| GET | `/customer/:customerId/:productId` | Get customer-specific pricing | - |
| GET | `/customer/:customerId/history` | Customer price history | `productId` |
| GET | `/violations/list` | List violations | `status`, `limit` |
| POST | `/violations` | Log violation | Violation fields |
| POST | `/violations/:id/resolve` | Resolve violation | `status`, `notes` |
| POST | `/customer-history` | Update customer history | History fields |

---

## Advanced Pricing

Base path: `/api/pricing`

### Volume Discount Rules
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/volume-rules` | Get volume rules | `isActive`, `scopeType` |
| GET | `/volume-rules/:id` | Get single rule | - |
| POST | `/volume-rules` | Create rule | `name`, `tiers[]` |
| PUT | `/volume-rules/:id` | Update rule | Rule fields |
| DELETE | `/volume-rules/:id` | Delete rule | - |
| GET | `/volume-rules/applicable/:productId` | Get applicable rules | `category`, `manufacturer` |

### Promotions
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/promotions` | Get promotions | `isActive`, `promoType` |
| GET | `/promotions/active` | Get active promotions | `productIds`, `customerId` |
| POST | `/promotions` | Create promotion | Promotion fields |
| PUT | `/promotions/:id` | Update promotion | Promotion fields |
| DELETE | `/promotions/:id` | Delete promotion | - |
| POST | `/promotions/validate-code` | Validate promo code | `code`, `cartTotal` |
| GET | `/promotions/:id/usage` | Get usage history | - |

### Price Calculation
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/calculate` | Calculate product price | `productId`, `quantity`, `customerId`, `promoCode` |
| POST | `/calculate-quote` | Calculate quote totals | `items[]`, `customerId`, `promoCode` |
| GET | `/stacking-policy` | Get stacking policy | - |

---

## Stripe Payments

Base path: `/api/stripe`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/create-checkout` | Create checkout session | `invoiceId`, `successUrl`, `cancelUrl` |
| POST | `/payment-link` | Generate payment link | `quotationId`, `amountCents` |
| GET | `/payment-link/:token` | Get link details | - |
| POST | `/payment-link/:token/process` | Process payment | Payment data |
| POST | `/webhook` | Handle Stripe webhooks | Raw body |
| GET | `/payment-status/:paymentIntentId` | Check payment status | - |
| POST | `/refund` | Refund payment | `chargeId`, `amountCents`, `reason` |
| GET | `/config` | Get Stripe config | - |

---

## Customer Payments

Base path: `/api/payments`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/customer/:customerId` | Get customer payments | - |
| GET | `/customer/:customerId/summary` | Get payment summary | - |
| POST | `/` | Record payment | `customer_id`, `amount`, `payment_method` |
| PUT | `/:id` | Update payment | Payment fields |
| DELETE | `/:id` | Delete payment | - |
| PUT | `/customer/:customerId/credit-limit` | Update credit limit | `credit_limit`, `payment_terms` |
| GET | `/stats` | Payment statistics | - |

---

## Categories

Base path: `/api/categories`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List categories | `parentId` |
| GET | `/tree` | Get category hierarchy | - |
| GET | `/:id` | Get category | - |
| POST | `/` | Create category | `name`, `parentId`, `description` |
| PUT | `/:id` | Update category | Category fields |
| DELETE | `/:id` | Delete category | - |
| GET | `/:id/products` | Get products in category | `limit`, `offset` |

---

## Analytics

Base path: `/api/analytics`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/revenue-features` | Revenue features analytics | `startDate`, `endDate`, `period` |
| GET | `/top-features` | Top performing features | `limit` |

**Response Format:**
```json
{
  "period": { "start": "2026-01-01", "end": "2026-01-31", "days": 30 },
  "totalQuotes": 150,
  "featureAdoption": {
    "financing": 25,
    "warranties": 80,
    "delivery": 120,
    "rebates": 15,
    "tradeIns": 10
  },
  "revenue": {
    "warranties": 45000,
    "delivery": 12000,
    "total": 57000
  }
}
```

---

## Product Metrics

Base path: `/api/product-metrics`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/:productId` | Get product metrics | - |
| GET | `/:productId/intelligence` | Get full intelligence package | - |
| POST | `/:productId/refresh` | Refresh metrics | - |
| POST | `/refresh-all` | Refresh all metrics | `batchSize` |
| GET | `/report/demand` | Demand classification report | `demandTag`, `manufacturer`, `category` |
| GET | `/report/stockout-risk` | Stockout risk products | - |
| GET | `/report/top-performers` | Top performers | `period`, `limit`, `metric` |

---

## Notifications

Base path: `/api/notifications`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | Get user notifications | `unreadOnly`, `limit`, `offset` |
| GET | `/unread-count` | Get unread count | - |
| POST | `/:id/read` | Mark as read | - |
| POST | `/mark-all-read` | Mark all as read | - |
| DELETE | `/:id` | Delete notification | - |

---

## Push Notifications

Base path: `/api/push`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/vapid-public-key` | Get VAPID public key | - |
| POST | `/subscribe` | Subscribe to push | Subscription object |
| POST | `/unsubscribe` | Unsubscribe | `endpoint` |
| POST | `/send` | Send push notification | `title`, `body`, `url` |
| GET | `/stats` | Push notification stats | - |
| POST | `/test` | Send test notification | - |

---

## Activities

Base path: `/api/activities`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/quote/:quoteId` | Get quote activities | `limit`, `category`, `eventType` |
| GET | `/quote/:quoteId/summary` | Activity summary | - |
| POST | `/quote/:quoteId/note` | Add note | `note`, `isInternal` |
| POST | `/quote/:quoteId/contact` | Log contact | `contactMethod`, `notes` |
| POST | `/quote/:quoteId/follow-up` | Schedule follow-up | `followUpDate`, `description` |
| POST | `/quote/:quoteId/price-adjustment` | Log price adjustment | `itemModel`, `oldPriceCents`, `newPriceCents` |
| POST | `/quote/:quoteId/customer-viewed` | Log customer view | `customerName` |
| GET | `/recent` | Recent activities | `limit`, `category` |
| GET | `/types` | Available activity types | - |
| GET | `/icons` | Icon mappings | - |

---

## Follow-up

Base path: `/api`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/quotations/:id/follow-ups` | Get quote follow-ups | - |
| GET | `/follow-ups/pending` | Get pending follow-ups | - |
| POST | `/quotations/:id/follow-ups` | Schedule follow-up | `reminder_type`, `scheduled_for` |
| PUT | `/follow-ups/:id/sent` | Mark as sent | - |
| DELETE | `/follow-ups/:id` | Cancel follow-up | - |
| POST | `/quotations/:id/interactions` | Log interaction | `interaction_type`, `notes` |
| GET | `/quotations/:id/interactions` | Get interactions | - |
| GET | `/follow-ups/stale-quotes` | Get stale quotes | `days` |
| GET | `/follow-ups/stats` | Follow-up stats | - |

---

## Package Builder

Base path: `/api/package-builder`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/questionnaires` | List questionnaires | - |
| GET | `/questionnaires/:type` | Get questionnaire | - |
| POST | `/sessions` | Create session | `package_type`, `customer_id` |
| GET | `/sessions/:uuid` | Get session | - |
| PUT | `/sessions/:uuid/answers` | Update answers | `answers` |
| POST | `/sessions/:uuid/generate` | Generate packages | - |
| GET | `/sessions/:uuid/packages` | Get generated packages | - |
| POST | `/sessions/:uuid/select` | Select tier | `tier` |
| POST | `/sessions/:uuid/add-to-quote` | Add to quote | `quote_id` |
| GET | `/alternatives/:productId` | Find alternatives | `category`, `tier` |
| POST | `/calculate-discount` | Calculate bundle discount | `items[]` |
| GET | `/stats` | Builder statistics | - |
| GET | `/products/:productId/attributes` | Get attributes | - |
| PUT | `/products/:productId/attributes` | Update attributes | Attributes |
| POST | `/products/bulk-attributes` | Bulk update | `attributes[]` |

---

## Package Builder V2

Base path: `/api/package-builder-v2`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/filter-options` | Get filter options with counts | `package_type`, filters |
| POST | `/generate` | Generate packages with filters | `package_type`, `filters` |
| GET | `/categories/:packageType` | Get appliance categories | - |
| GET | `/brands/:packageType` | Get brands with counts | - |
| POST | `/preview` | Preview product counts | `package_type`, `filters` |

---

## AI Personalization

Base path: `/api/ai`

### Dynamic Pricing
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/dynamic-pricing/calculate` | Calculate dynamic pricing | `productId`, `quantity`, `customerId` |
| GET | `/dynamic-pricing/rules` | Get pricing rules | `isActive`, `ruleType` |

### Upselling
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/upsell/recommendations/:productId` | Get recommendations | `customerId`, `limit` |
| POST | `/upsell/for-quote` | Quote recommendations | `quoteItems[]`, `customerId` |
| GET | `/upsell/rules` | Get upsell rules | - |
| POST | `/upsell/rules` | Create upsell rule | Rule fields |
| PUT | `/upsell/rules/:id` | Update rule | Rule fields |
| DELETE | `/upsell/rules/:id` | Delete rule | - |

### Suggestions & Behavior
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/suggestions/quote` | Smart suggestions | `quoteItems[]`, `customerId` |
| POST | `/behavior/track` | Track behavior | `customerId`, `eventType`, `productId` |
| POST | `/recommendations/interact` | Record interaction | `recommendationId`, `accepted` |

### Product Affinity
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/affinity/:productId` | Get affinities | - |
| POST | `/affinity` | Set affinity | `sourceProductId`, `targetProductId`, `score` |

---

## Counter Offers

Base path: `/api`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/quotes/:id/counter-offers` | Submit counter-offer | `counterOfferTotalCents`, `message` |
| GET | `/quotes/:id/counter-offers` | Get negotiation history | - |
| POST | `/counter-offers/:id/accept` | Accept counter-offer | `message` |
| POST | `/counter-offers/:id/reject` | Reject counter-offer | `message` |
| POST | `/counter-offers/:id/counter` | Send counter-proposal | `newOfferTotalCents`, `message` |
| GET | `/counter-offers/magic/:token` | Validate magic link | - |
| POST | `/counter-offers/magic/:token` | Customer response | `action`, `newOfferCents` |
| GET | `/counter-offers/pending` | Get pending offers | - |
| POST | `/quotes/:id/portal-link` | Generate portal link | - |
| GET | `/quote/view/:token` | Public quote view | - |

---

## Vendor Products

Base path: `/api/vendor-products`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List vendor products | `vendor_source_id`, `category`, `brand`, `search` |
| GET | `/stats` | Get statistics | - |
| GET | `/categories` | Get categories | `vendor_source_id` |
| GET | `/brands` | Get brands | `vendor_source_id` |
| GET | `/search` | Search products | `q`, `page`, `limit` |
| GET | `/:id` | Get product details | - |
| GET | `/:id/images` | Get product images | `type` |
| GET | `/:id/assets` | Get product assets | - |
| POST | `/scrape` | Start scrape job | `vendor`, `job_type`, `categories` |
| GET | `/scrape/status` | Get scrape status | `job_id` |
| GET | `/scrape/history` | Get scrape history | `vendor_source_id`, `limit` |
| GET | `/sources` | Get vendor sources | - |
| GET | `/sources/:id` | Get vendor source | - |

---

## 3D Product Models

Base path: `/api/product-3d`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/products` | Products with 3D models | `category`, `manufacturer`, `limit` |
| GET | `/stats` | 3D model statistics | - |
| GET | `/samples` | Sample/demo models | - |
| GET | `/:productId` | Get product 3D model | - |
| POST | `/:productId` | Create/update model | Model fields |
| POST | `/:productId/upload` | Upload model files | File uploads |
| DELETE | `/:productId` | Delete 3D model | - |
| GET | `/:productId/materials` | Get materials | `category` |
| POST | `/:productId/materials` | Add/update material | Material fields |
| DELETE | `/:productId/materials/:materialId` | Delete material | - |
| POST | `/:productId/hotspots` | Add hotspot | Hotspot fields |
| DELETE | `/:productId/hotspots/:hotspotId` | Delete hotspot | - |
| GET | `/:productId/configurations` | Get configurations | `templates_only` |
| POST | `/:productId/configurations` | Save configuration | Config fields |
| GET | `/configurations/:configId` | Get configuration | - |
| POST | `/:productId/calculate-price` | Calculate config price | `selected_materials[]` |

---

## Import Templates

Base path: `/api/import-templates`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List templates | `manufacturer`, `active_only`, `file_type` |
| GET | `/manufacturers` | Manufacturers with templates | - |
| GET | `/target-fields` | Available target fields | - |
| GET | `/:id` | Get template | - |
| POST | `/` | Create template | Template fields |
| PUT | `/:id` | Update template | Template fields |
| DELETE | `/:id` | Delete template | - |
| POST | `/:id/clone` | Clone template | `name`, `manufacturer` |
| POST | `/match` | Find matching template | `filename`, `headers`, `sampleRows` |
| POST | `/detect-columns` | Detect column mappings | `headers`, `sampleRows` |
| POST | `/parse-file` | Parse uploaded file | File upload |
| POST | `/:id/test` | Test template | `headers`, `sampleData` |
| POST | `/:id/corrections` | Record correction | Correction data |
| GET | `/:id/learning-history` | Get learning history | - |
| GET | `/:id/usage-history` | Get usage history | `limit` |
| POST | `/:id/record-usage` | Record usage | Usage data |

---

## API Keys

Base path: `/api/api-keys`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/` | List API keys | - |
| POST | `/` | Create API key | `key_name`, `permissions`, `expires_at` |
| PUT | `/:id` | Update API key | Key fields |
| DELETE | `/:id` | Delete API key | - |
| POST | `/:id/regenerate` | Regenerate secret | - |

---

## Quote Protection

Base path: `/api`

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/email-templates` | Get email templates | `category` |
| GET | `/email-templates/:id` | Get template | - |
| POST | `/email-templates` | Create template | Template fields |
| PUT | `/email-templates/:id` | Update template | Template fields |
| DELETE | `/email-templates/:id` | Delete template | - |
| POST | `/quotations/:id/track` | Track event | `event_type`, `device_type` |
| GET | `/quotations/:id/tracking` | Get tracking events | - |
| POST | `/quotations/:id/generate-tracking-token` | Generate tracking token | - |
| PUT | `/quotations/:id/protection` | Update protection settings | Protection fields |
| GET | `/quotations/expiring-soon` | Get expiring quotes | `days` |
| POST | `/quotations/expire-old` | Expire old quotes | - |

---

## 2026 Features

Base path: `/api/features`

### Special Orders
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/products/stock-status` | Products with stock status | `in_stock`, `orderable` |
| PUT | `/products/:id/stock` | Update stock status | Stock fields |
| POST | `/products/bulk-stock-update` | Bulk update stock | `product_ids`, `updates` |

### E-Signatures
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/quotes/:id/generate-acceptance-link` | Generate acceptance link | - |
| GET | `/quotes/verify-token/:token` | Verify token | - |
| POST | `/quotes/:id/sign` | Submit signature | Signature data |
| GET | `/quotes/:id/signatures` | Get signatures | - |

### Customer Portal
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/customers/:id/portal-access` | Generate portal access | - |
| GET | `/portal/:token` | Access portal | - |
| POST | `/portal/quotes/:id/change-request` | Submit change request | Request fields |
| GET | `/quotes/:id/change-requests` | Get change requests | - |
| POST | `/quotes/:id/comments` | Add comment | `comment_text`, `is_internal` |

### Quote Templates
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/quote-templates` | Get all templates | - |
| GET | `/quote-templates/:id` | Get template | - |
| POST | `/quote-templates` | Create template | Template fields |
| POST | `/quote-templates/:id/create-quote` | Create quote from template | `customer_id` |

### Versioning & Mobile
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/quotes/:id/create-version` | Create version | `version_notes`, `changed_by` |
| GET | `/quotes/:id/versions` | Get versions | - |
| POST | `/quotes/:id/public-link` | Generate public link | - |
| GET | `/public/quotes/:token` | View public quote | - |

### Follow-ups
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/follow-up-rules` | Get follow-up rules | - |
| POST | `/follow-up-rules` | Create rule | Rule fields |
| GET | `/follow-ups/pending` | Get pending | - |
| POST | `/quotes/:id/schedule-followup` | Schedule follow-up | Follow-up fields |
| PUT | `/follow-ups/:id/sent` | Mark sent | - |

### Payments & Attachments
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/quotes/:id/payments` | Get payments | - |
| POST | `/quotes/:id/payments` | Record payment | Payment fields |
| GET | `/payment-settings` | Get settings | - |
| GET | `/quotes/:id/attachments` | Get attachments | - |
| POST | `/quotes/:id/attachments` | Upload attachment | File upload |
| DELETE | `/attachments/:id` | Delete attachment | - |
| GET | `/products/:id/spec-sheets` | Get spec sheets | - |

### Price Books
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/price-books` | Get price books | - |
| POST | `/price-books` | Create price book | Book fields |
| GET | `/price-notifications` | Get notifications | `acknowledged` |
| PUT | `/price-notifications/:id/acknowledge` | Acknowledge | `acknowledged_by` |
| GET | `/scheduled-price-updates` | Get scheduled updates | - |

---

## Marketplace

Base path: `/api/marketplace`

### Orders
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/orders` | List marketplace orders | `status`, `limit`, `offset` |
| GET | `/orders/:id` | Get order details | - |
| GET | `/pull-orders` | Pull from Mirakl | - |
| POST | `/orders/sync` | Sync orders | `start_date`, `order_state_codes` |
| POST | `/orders/:id/accept` | Accept order | - |
| POST | `/orders/:id/refuse` | Refuse order | `reason` |

### Shipments
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/orders/:id/shipments` | Create shipment | `tracking_number`, `carrier_code` |

### Product Sync
| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| POST | `/sync-offers` | Sync all products | - |
| POST | `/products/:id/sync` | Sync single product | - |
| POST | `/products/sync-bulk` | Bulk sync | `product_ids[]` |
| POST | `/products/batch-sync` | Batch sync | `batch_size`, `delay_ms` |

---

## Error Response Format

All API endpoints return errors in the following format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

### Common Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `VALIDATION_ERROR` | 422 | Validation failed |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Authentication Headers

All authenticated endpoints require:

```
Authorization: Bearer <jwt_token>
```

For API key authentication:
```
X-API-Key: <api_key>
X-API-Secret: <api_secret>
```

---

## Pagination

List endpoints support pagination:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Items per page (max 100) |
| `offset` | integer | 0 | Skip items |
| `page` | integer | 1 | Page number (alternative to offset) |

Response includes pagination info:
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

*Documentation generated on 2026-01-09*
