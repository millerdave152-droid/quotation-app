# Barcode Data Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture all Barcode Lookup API v3 data (barcode formats, full attributes, store pricing with links) and display it with generated barcode images on a new Product Detail page + inline previews.

**Architecture:** Two new JSONB/VARCHAR columns on `products` table store barcode formats and attributes. A new `bwip-js` endpoint generates barcode PNGs. Frontend uses `jsbarcode` for SVG rendering. New `ProductDetailPage` component shows all data; existing `ProductManagement` "View" mode enhanced with barcode + store panels.

**Tech Stack:** bwip-js (backend PNG), jsbarcode (frontend SVG), Express 5, React 19, PostgreSQL JSONB

---

### Task 1: Database Migration

**Files:**
- Create: `backend/migrations/147_barcode_data_enrichment.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Migration 147: Barcode Data Enrichment
-- Adds barcode_formats and barcode_attributes columns to products table
-- for storing full Barcode Lookup API v3 response data.
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_formats VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_attributes JSONB;

COMMENT ON COLUMN products.barcode_formats IS 'Raw barcode format string from Barcode Lookup API, e.g. "UPC-A 196641097995, EAN-13 0196641097995"';
COMMENT ON COLUMN products.barcode_attributes IS 'Full product attributes from Barcode Lookup API (age_group, material, size, features, reviews, etc.)';
```

**Step 2: Run the migration**

Run: `cd backend && node -e "const pool = require('./db'); pool.query(require('fs').readFileSync('./migrations/147_barcode_data_enrichment.sql','utf8')).then(() => { console.log('Migration OK'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); })"`

Expected: `Migration OK`

**Step 3: Commit**

```bash
git add backend/migrations/147_barcode_data_enrichment.sql
git commit -m "feat: add barcode_formats and barcode_attributes columns to products"
```

---

### Task 2: Update Barcode Normalizer

**Files:**
- Modify: `backend/normalizers/barcodeLookupNormalizer.js`

**Step 1: Add attribute collection helper**

After the `normalizeStorePricing` function (around line 183), add:

```javascript
/**
 * Collect all non-empty product attributes into a flat object.
 * Captures fields that aren't mapped to dedicated columns.
 *
 * @param {Object} product - Single product from API
 * @returns {Object|null} Attributes object, or null if nothing to store
 */
function collectAttributes(product) {
  if (!product || typeof product !== 'object') return null;

  const attrs = {};
  const fields = [
    'age_group', 'ingredients', 'nutrition_facts', 'energy_efficiency_class',
    'gender', 'material', 'pattern', 'format', 'multipack', 'size',
    'release_date', 'last_update', 'asin', 'contributors', 'features',
    'reviews',
  ];

  for (const field of fields) {
    const val = product[field];
    if (val == null) continue;
    // Skip empty strings and empty arrays
    if (typeof val === 'string' && val.trim() === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    attrs[field] = val;
  }

  return Object.keys(attrs).length > 0 ? attrs : null;
}
```

**Step 2: Update `normalizeBarcodeProduct` return object**

In the `normalizeBarcodeProduct` function, add `collectAttributes` call and include new fields in return. After the `extractMSRP` call (around line 302), add:

```javascript
  const barcodeAttributes = collectAttributes(product);
```

Then in the return object, add these two fields:

```javascript
    barcode_formats:    product.barcode_formats || null,
    barcode_attributes: barcodeAttributes,
```

**Step 3: Add `collectAttributes` to exports**

In the `_internal` exports object, add `collectAttributes`.

**Step 4: Verify syntax**

Run: `node -c backend/normalizers/barcodeLookupNormalizer.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/normalizers/barcodeLookupNormalizer.js
git commit -m "feat: capture barcode_formats and full attributes in normalizer"
```

---

### Task 3: Update CE Import Route to Store New Columns

**Files:**
- Modify: `backend/routes/admin/ce-import.js`

**Step 1: Update the UPDATE query (around line 103)**

Add two new columns to the UPDATE SET clause, incrementing parameter numbers:

```sql
        barcode_formats   = COALESCE($14, barcode_formats),
        barcode_attributes = COALESCE($15, barcode_attributes),
```

Add to the params array:
```javascript
      product.barcode_formats || null,
      product.barcode_attributes ? JSON.stringify(product.barcode_attributes) : null,
```

Update the WHERE clause parameter number accordingly (`$13` becomes `$15` for id).

**Step 2: Update the INSERT query (around line 148)**

Add `barcode_formats` and `barcode_attributes` to the column list and VALUES:

```sql
      manufacturer, model, sku, upc, name, description, category,
      msrp_cents, image_url, ce_specs, icecat_product_id, data_source,
      color, import_source, import_date, active,
      barcode_formats, barcode_attributes,
      created_at, updated_at
```

Add to VALUES placeholders and params array:
```javascript
    product.barcode_formats || null,
    product.barcode_attributes ? JSON.stringify(product.barcode_attributes) : null,
```

**Step 3: Verify syntax**

Run: `node -c backend/routes/admin/ce-import.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/routes/admin/ce-import.js
git commit -m "feat: store barcode_formats and barcode_attributes during CE import"
```

---

### Task 4: Install bwip-js and Create Barcode PNG Endpoint

**Files:**
- Create: `backend/routes/barcode-image.js`
- Modify: `backend/server.js` (mount the route)

**Step 1: Install bwip-js**

Run: `cd backend && npm install bwip-js`

**Step 2: Create the barcode image route**

Create `backend/routes/barcode-image.js`:

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const bwipjs = require('bwip-js');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;

const init = (deps) => {
  pool = deps.pool;
  return router;
};

/**
 * GET /api/products/:id/barcode.png
 *
 * Generates a barcode PNG image for the product's UPC.
 * Query params:
 *   format: 'upca' (default) or 'ean13'
 *   scale:  1-5 (default 3)
 */
router.get('/:id/barcode.png', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const format = (req.query.format || 'upca').toLowerCase();
  const scale = Math.min(5, Math.max(1, parseInt(req.query.scale) || 3));

  const result = await pool.query('SELECT upc, barcode_formats FROM products WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  const { upc } = result.rows[0];
  if (!upc) {
    throw new ApiError('Product has no UPC barcode', 400);
  }

  // Determine barcode type and value
  let bcid, text;
  if (format === 'ean13' || format === 'ean-13') {
    bcid = 'ean13';
    // EAN-13 is 13 digits; if UPC-A (12 digits), prepend 0
    text = upc.length === 12 ? '0' + upc : upc;
  } else {
    bcid = 'upca';
    // UPC-A is 12 digits; if EAN-13 (13 digits starting with 0), strip leading 0
    text = upc.length === 13 && upc.startsWith('0') ? upc.substring(1) : upc;
  }

  const png = await bwipjs.toBuffer({
    bcid,
    text,
    scale,
    height: 12,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
  });

  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400'); // Cache 24h
  res.send(png);
}));

module.exports = { router, init };
```

**Step 3: Mount the route in server.js**

In `backend/server.js`, after the product routes block (around line 568), add:

```javascript
// Barcode image generation
const initBarcodeImageRoutes = require('./routes/barcode-image').init;
app.use('/api/products', initBarcodeImageRoutes({ pool }));
console.log('✅ Barcode image routes loaded');
```

**Step 4: Verify server starts**

Run: `node -c backend/routes/barcode-image.js && node -c backend/server.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/routes/barcode-image.js backend/server.js backend/package.json backend/package-lock.json
git commit -m "feat: add barcode PNG generation endpoint using bwip-js"
```

---

### Task 5: Install jsbarcode Frontend + Create BarcodeDisplay Component

**Files:**
- Create: `frontend/src/components/product/BarcodeDisplay.jsx`

**Step 1: Install jsbarcode**

Run: `cd frontend && npm install jsbarcode`

**Step 2: Create BarcodeDisplay component**

Create `frontend/src/components/product/BarcodeDisplay.jsx`:

```javascript
import React, { useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * BarcodeDisplay - Renders a UPC/EAN barcode as SVG with format info and PNG download.
 *
 * Props:
 *   upc (string)            - UPC/EAN barcode number
 *   barcodeFormats (string)  - Raw format string from API, e.g. "UPC-A 196641097995, EAN-13 0196641097995"
 *   productId (number)       - Product ID for PNG download endpoint
 *   compact (boolean)        - Compact mode for inline previews (default false)
 */
const BarcodeDisplay = ({ upc, barcodeFormats, productId, compact = false }) => {
  const svgRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!upc || !svgRef.current) return;
    try {
      // Determine format: 13 digits = EAN-13, 12 digits = UPC-A
      const format = upc.length === 13 ? 'EAN13' : 'UPC';
      JsBarcode(svgRef.current, upc, {
        format,
        width: compact ? 1.5 : 2,
        height: compact ? 40 : 60,
        displayValue: true,
        fontSize: compact ? 12 : 14,
        margin: compact ? 5 : 10,
        background: '#ffffff',
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [upc, compact]);

  if (!upc) return null;

  // Parse barcode formats string into array
  const formats = barcodeFormats
    ? barcodeFormats.split(',').map(f => f.trim()).filter(Boolean)
    : [`UPC-A ${upc}`];

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      padding: compact ? '12px' : '20px',
      textAlign: 'center',
    }}>
      {!compact && (
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          Barcode
        </div>
      )}

      {/* SVG Barcode */}
      {error ? (
        <div style={{ color: '#9ca3af', fontSize: '13px', padding: '20px 0' }}>
          Unable to render barcode
        </div>
      ) : (
        <svg ref={svgRef} style={{ maxWidth: '100%' }} />
      )}

      {/* Barcode Formats */}
      {!compact && formats.length > 0 && (
        <div style={{
          marginTop: '12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          justifyContent: 'center',
        }}>
          {formats.map((fmt, i) => (
            <span key={i} style={{
              display: 'inline-block',
              padding: '3px 10px',
              background: '#f3f4f6',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#6b7280',
              fontFamily: 'monospace',
            }}>
              {fmt}
            </span>
          ))}
        </div>
      )}

      {/* Download PNG Button */}
      {!compact && productId && (
        <a
          href={`/api/products/${productId}/barcode.png?scale=4`}
          download={`barcode-${upc}.png`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px',
            padding: '6px 14px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#6b7280',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Download PNG
        </a>
      )}
    </div>
  );
};

export default BarcodeDisplay;
```

**Step 3: Verify it compiles**

Run: `cd frontend && npx react-scripts build 2>&1 | tail -5` (or just check syntax)

**Step 4: Commit**

```bash
git add frontend/src/components/product/BarcodeDisplay.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add BarcodeDisplay component with JsBarcode SVG + PNG download"
```

---

### Task 6: Create OnlineStoresPanel Component

**Files:**
- Create: `frontend/src/components/product/OnlineStoresPanel.jsx`

**Step 1: Create the component**

```javascript
import React, { useState, useEffect } from 'react';
import { authFetch } from '../../services/authFetch';

const OnlineStoresPanel = ({ productId, compact = false }) => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    authFetch(`/api/products/${productId}`)
      .then(res => res.json())
      .then(data => {
        // Fetch competitor prices for this product
        return authFetch(`/api/pricing/competitors/${productId}`);
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setStores(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return <div style={{ padding: '16px', color: '#9ca3af', fontSize: '13px' }}>Loading store prices...</div>;
  }

  if (stores.length === 0) {
    return (
      <div style={{
        padding: '16px',
        color: '#9ca3af',
        fontSize: '13px',
        textAlign: 'center',
        background: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}>
        No online store pricing available for this product.
      </div>
    );
  }

  const lowestPrice = Math.min(...stores.filter(s => s.competitor_price > 0).map(s => parseFloat(s.competitor_price)));

  if (compact) {
    const count = stores.length;
    return (
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        {count} store{count !== 1 ? 's' : ''} &middot; from ${lowestPrice.toFixed(0)}
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span>Online Stores</span>
        <span style={{
          padding: '2px 8px',
          background: '#dbeafe',
          color: '#1d4ed8',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {stores.length}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
            <th style={thStyle}>Store</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Currency</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Updated</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store, i) => {
            const price = parseFloat(store.competitor_price);
            const isLowest = price === lowestPrice && price > 0;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{store.competitor_name || 'Unknown'}</span>
                </td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  fontWeight: 600,
                  color: isLowest ? '#059669' : '#111827',
                }}>
                  ${price.toFixed(2)}
                  {isLowest && (
                    <span style={{
                      marginLeft: '6px',
                      padding: '1px 6px',
                      background: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}>
                      LOWEST
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>
                  {store.currency || 'CAD'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                  {store.last_fetched_at
                    ? new Date(store.last_fetched_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                    : '-'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {store.competitor_url ? (
                    <a
                      href={store.competitor_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#667eea',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      View
                    </a>
                  ) : (
                    <span style={{ color: '#d1d5db' }}>&mdash;</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'middle',
};

export default OnlineStoresPanel;
```

**Step 2: Commit**

```bash
git add frontend/src/components/product/OnlineStoresPanel.jsx
git commit -m "feat: add OnlineStoresPanel component with store pricing and View links"
```

---

### Task 7: Create Competitor Prices API Endpoint

**Files:**
- Modify: `backend/routes/products.js`

**Step 1: Add competitor prices endpoint**

In `backend/routes/products.js`, add a new route after the existing `GET /:id` route:

```javascript
/**
 * GET /api/products/:id/competitor-prices
 * Returns all competitor prices for a product with store links.
 */
router.get('/:id/competitor-prices', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    SELECT competitor_name, competitor_price, currency,
           competitor_url, pricing_source, last_fetched_at,
           created_at
    FROM competitor_prices
    WHERE product_id = $1
    ORDER BY competitor_price ASC
  `, [id]);

  res.success(result.rows);
}));
```

**Step 2: Verify syntax**

Run: `node -c backend/routes/products.js && echo "OK"`
Expected: `OK`

**Step 3: Update OnlineStoresPanel to use correct endpoint**

In `frontend/src/components/product/OnlineStoresPanel.jsx`, change the fetch URL from:
```javascript
authFetch(`/api/pricing/competitors/${productId}`)
```
to:
```javascript
authFetch(`/api/products/${productId}/competitor-prices`)
```

And remove the first unnecessary fetch call. Simplify the useEffect to:

```javascript
  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    authFetch(`/api/products/${productId}/competitor-prices`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setStores(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);
```

**Step 4: Commit**

```bash
git add backend/routes/products.js frontend/src/components/product/OnlineStoresPanel.jsx
git commit -m "feat: add competitor-prices API endpoint and wire to OnlineStoresPanel"
```

---

### Task 8: Create ProductDetailPage

**Files:**
- Create: `frontend/src/components/product/ProductDetailPage.jsx`
- Modify: `frontend/src/App.js` (add route)

**Step 1: Create ProductDetailPage component**

Create `frontend/src/components/product/ProductDetailPage.jsx`. This is a full-page component with sections for: header, barcode, attributes, specs, and online stores. Uses BarcodeDisplay and OnlineStoresPanel components.

The component should:
- Fetch product by ID from `/api/products/:id`
- Display product image, name, brand, model, UPC, category
- Show BarcodeDisplay component with UPC and barcode_formats
- Show barcode_attributes in a key-value grid (skip empty values)
- Show ce_specs in a key-value grid
- Show OnlineStoresPanel with store pricing and View links
- Include a "Back to Products" navigation link

**Step 2: Add route in App.js**

In `frontend/src/App.js`, add lazy import at top (around line 28):
```javascript
const ProductDetailPage = React.lazy(() => import('./components/product/ProductDetailPage'));
```

Add route inside the protected routes block (around line 549):
```javascript
<Route path="/products/detail/:id" element={<ProductDetailPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/components/product/ProductDetailPage.jsx frontend/src/App.js
git commit -m "feat: add ProductDetailPage with barcode, attributes, and online stores"
```

---

### Task 9: Enhance ProductManagement with Inline Previews

**Files:**
- Modify: `frontend/src/components/ProductManagement.jsx`

**Step 1: Import new components**

At the top of ProductManagement.jsx, add:
```javascript
import BarcodeDisplay from './product/BarcodeDisplay';
import OnlineStoresPanel from './product/OnlineStoresPanel';
```

**Step 2: Update the "View" button to link to detail page**

In the product table row where the "View" button is rendered (around line 2134), add a "Details" link next to it:

```javascript
<a
  href={`/products/detail/${product.id}`}
  style={{ padding: '6px 12px', marginRight: '5px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', textDecoration: 'none', display: 'inline-block' }}
>
  Details
</a>
```

**Step 3: Enhance the existing details view (renderDetails)**

In the `renderDetails()` function, add BarcodeDisplay and OnlineStoresPanel components after the existing product info section. Check for `selectedProduct.upc` to show barcode, and `selectedProduct.id` for store pricing.

**Step 4: Commit**

```bash
git add frontend/src/components/ProductManagement.jsx
git commit -m "feat: add inline barcode preview and detail links to ProductManagement"
```

---

### Task 10: Re-import Soundbar and Verify End-to-End

**Step 1: Restart backend**

Kill the running server and restart:
```bash
cd backend
# Find PID: netstat -ano | grep :3001 | grep LISTEN
# Kill: taskkill //PID <pid> //F
node server.js &
```

**Step 2: Re-import the soundbar**

Write a script `backend/_test_reimport.js` that:
1. Logs in as admin
2. POSTs to `/api/admin/products/import-ce` with UPC `196641097995`
3. Logs the result
4. Queries the database to verify `barcode_formats` and `barcode_attributes` are populated
5. Queries competitor_prices to verify store links

**Step 3: Test barcode PNG endpoint**

Open browser to: `http://localhost:3001/api/products/27684/barcode.png`
Expected: PNG barcode image of UPC 196641097995

**Step 4: Test frontend**

Open browser to: `http://localhost:3000/products/detail/27684`
Expected: Product detail page with barcode SVG, attributes, specs, and online store pricing

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: barcode data enrichment — formats, attributes, barcode images, online store pricing"
```
