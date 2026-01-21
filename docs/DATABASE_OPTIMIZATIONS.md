# Database Query Optimizations

This document summarizes the database optimizations implemented to improve query performance.

## Overview

The following optimizations were applied:
1. Added missing database indexes
2. Fixed N+1 query patterns
3. Added query result caching

## 1. New Database Indexes

### Migration File
`backend/migrations/add-query-optimizations.js`

Run with:
```bash
node backend/migrations/add-query-optimizations.js
```

### Indexes Added

#### Revenue Features Tables
| Table | Column | Index Name |
|-------|--------|------------|
| quote_financing | quote_id | idx_quote_financing_quote_id |
| quote_warranties | quote_id | idx_quote_warranties_quote_id |
| quote_delivery | quote_id | idx_quote_delivery_quote_id |
| quote_rebates | quote_id | idx_quote_rebates_quote_id |
| quote_trade_ins | quote_id | idx_quote_trade_ins_quote_id |

#### Order System
| Table | Column | Index Name |
|-------|--------|------------|
| orders | quotation_id | idx_orders_quotation_id |
| orders | customer_id | idx_orders_customer_id |
| orders | status | idx_orders_status |
| orders | created_at | idx_orders_created_at |
| order_items | order_id | idx_order_items_order_id |
| order_items | product_id | idx_order_items_product_id |

#### Invoice System
| Table | Column | Index Name |
|-------|--------|------------|
| invoices | order_id | idx_invoices_order_id |
| invoices | quotation_id | idx_invoices_quotation_id |
| invoices | customer_id | idx_invoices_customer_id |
| invoices | status | idx_invoices_status |
| invoices | due_date | idx_invoices_due_date |
| invoice_payments | invoice_id | idx_invoice_payments_invoice_id |

#### Marketplace Sync
| Table | Column | Index Name |
|-------|--------|------------|
| marketplace_orders | customer_id | idx_mp_orders_customer_id |
| marketplace_order_items | order_id | idx_mp_order_items_order_id |
| marketplace_order_items | product_id | idx_mp_order_items_product_id |
| marketplace_shipments | order_id | idx_mp_shipments_order_id |
| marketplace_sync_log | entity_type | idx_mp_sync_entity_type |
| marketplace_sync_log | status | idx_mp_sync_status |

#### CLV and Churn System
| Table | Column | Index Name |
|-------|--------|------------|
| churn_alerts | customer_id | idx_churn_alerts_customer_id |
| churn_alerts | created_at | idx_churn_alerts_created_at |
| churn_alerts | status | idx_churn_alerts_status |
| churn_alert_job_log | status | idx_churn_job_log_status |
| churn_alert_job_log | created_at | idx_churn_job_log_created_at |

#### Composite Indexes
| Table | Columns | Index Name |
|-------|---------|------------|
| customers | customer_type, created_at DESC | idx_customers_type_created |
| quotations | customer_id, created_at DESC | idx_quotations_customer_created |
| invoices | status, due_date | idx_invoices_status_due |
| orders | customer_id, status | idx_orders_customer_status |
| products | category_id, manufacturer | idx_products_category_manufacturer |
| quotation_items | product_id, quotation_id | idx_quote_items_product_quotation |

#### Partial Indexes (Filtered)
| Table | Filter | Index Name |
|-------|--------|------------|
| products | WHERE active = true | idx_products_active_only |
| quotations | WHERE status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') | idx_quotations_pending_only |
| quotations | WHERE status = 'WON' | idx_quotations_won_for_clv |
| invoices | WHERE status IN ('draft', 'sent', 'partial') | idx_invoices_unpaid |

## 2. N+1 Query Pattern Fixes

### Analytics Routes (`backend/routes/analytics.js`)

**Before (N+1 pattern):**
The `/api/analytics/top-features` endpoint was making 5 database queries for each quote:
```javascript
// For EACH quote, made 5 separate queries:
for (const quote of quotes) {
  await pool.query('SELECT COUNT(*) FROM quote_financing WHERE quote_id = $1');
  await pool.query('SELECT COUNT(*) FROM quote_warranties WHERE quote_id = $1');
  await pool.query('SELECT COUNT(*) FROM quote_delivery WHERE quote_id = $1');
  await pool.query('SELECT COUNT(*) FROM quote_rebates WHERE quote_id = $1');
  await pool.query('SELECT COUNT(*) FROM quote_trade_ins WHERE quote_id = $1');
}
```

**After (Single query with JOINs):**
```sql
SELECT
  q.id, q.quotation_number, q.customer_name, q.created_at, q.total_cents,
  COALESCE(qf.financing_count, 0) > 0 as has_financing,
  COALESCE(qw.warranties_count, 0)::int as warranties_count,
  ...
FROM quotations q
LEFT JOIN (SELECT quote_id, COUNT(*) as financing_count FROM quote_financing GROUP BY quote_id) qf ON q.id = qf.quote_id
LEFT JOIN (SELECT quote_id, COUNT(*) as warranties_count FROM quote_warranties GROUP BY quote_id) qw ON q.id = qw.quote_id
...
```

**Impact:** Reduced from 5N+1 queries to 1 query (for 10 quotes: 51 queries → 1 query)

### Order Service (`backend/services/OrderService.js`)

**Before (N+1 pattern):**
```javascript
for (const item of items) {
  await client.query('INSERT INTO order_items VALUES ($1, $2, ...)', [order.id, item.product_id, ...]);
}
```

**After (Batch INSERT):**
```javascript
const placeholders = items.map((_, i) => `($${i*5+1}, $${i*5+2}, ...)`).join(', ');
await client.query(`INSERT INTO order_items VALUES ${placeholders}`, values);
```

**Impact:** Reduced from N queries to 1 query

## 3. Query Result Caching

### Analytics Endpoints

Added caching to expensive analytics queries using the existing `cache.js` module:

| Endpoint | Cache Key | TTL |
|----------|-----------|-----|
| `/api/analytics/revenue-features` | `analytics:revenue-features:{start}:{end}:{days}` | 5 minutes |
| `/api/analytics/top-features` | `analytics:top-features:{limit}` | 5 minutes |

**Usage Pattern:**
```javascript
const cacheKey = `analytics:revenue-features:${start}:${end}:${days}`;
const cached = cache.get('short', cacheKey);
if (cached) {
  return res.success(cached);
}

// ... execute query ...

cache.set('short', cacheKey, analytics);
```

## 4. Expected Performance Improvements

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Analytics top-features (10 quotes) | 51 queries | 1 query | ~98% reduction |
| Order conversion (10 items) | 10 INSERT queries | 1 batch INSERT | ~90% reduction |
| Analytics dashboard load | Full DB query | Cached (5 min) | ~100% on cache hit |
| CLV calculations | Sequential scans | Indexed lookups | ~10x faster |
| Invoice due date queries | Full table scan | Partial index scan | ~5x faster |

## 5. Monitoring Recommendations

1. **Check index usage:**
   ```sql
   SELECT relname, indexrelname, idx_scan, idx_tup_read
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY idx_scan DESC;
   ```

2. **Check cache hit rates:**
   ```javascript
   const stats = require('./cache').getStats();
   console.log(stats);
   ```

3. **Identify slow queries:**
   Enable `pg_stat_statements` extension to track query performance.

## 6. Future Optimizations

Consider implementing:
- Connection pooling tuning (currently using default pg pool settings)
- Query plan caching for complex queries
- Read replicas for analytics queries
- Materialized views for dashboard aggregations
- Pagination cursor-based instead of offset-based for large datasets
