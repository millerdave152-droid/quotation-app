# Barcode Data Enrichment + Online Store Pricing

**Date:** 2026-02-25
**Status:** Approved

## Goal

Capture all available data from Barcode Lookup API v3 during product import: barcode formats, full product attributes, generated barcode images, and online store pricing with direct retailer links. Display this data on a new Product Detail page with inline previews in the product list.

## Current State

- Normalizer captures: UPC, name, brand, model, MPN, description, MSRP, images, category, color, specs, store pricing
- Missing: barcode_formats string, many attribute fields (age_group, material, pattern, size, energy_efficiency_class, release_date, features, reviews, etc.)
- No barcode image rendering (API does not provide barcode images)
- Store pricing saved to competitor_prices table but no direct "View" links in the UI
- No dedicated product detail page exists

## Design

### 1. Database Migration

Add two columns to `products` table:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_formats VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_attributes JSONB;
```

- `barcode_formats`: Raw format string from API, e.g., "UPC-A 196641097995, EAN-13 0196641097995"
- `barcode_attributes`: JSONB capturing all non-empty attribute fields (age_group, material, pattern, size, energy_efficiency_class, release_date, gender, multipack, format, ingredients, nutrition_facts, contributors, features, reviews, last_update)

No new tables needed. `competitor_prices` already stores retailer URLs via `competitor_url`.

### 2. Normalizer Update (barcodeLookupNormalizer.js)

Add to normalized output:
- `barcode_formats`: Pass through the raw string
- `barcode_attributes`: Collect all non-empty API attribute fields into JSONB object

Attribute fields to capture:
- age_group, ingredients, nutrition_facts, energy_efficiency_class, color, gender, material, pattern, format, multipack, size, release_date, length, width, height, weight, contributors, features, reviews, last_update, manufacturer, asin, mpn

### 3. CE Import Route Update (ce-import.js)

- INSERT/UPDATE to include `barcode_formats` and `barcode_attributes` columns
- Also store `competitor_url` (product link) when inserting competitor prices (already done)

### 4. Backend Barcode Image Endpoint

New route: `GET /api/products/:id/barcode.png`

- Query params: `format` (UPC-A or EAN-13, defaults to UPC-A)
- Uses `bwip-js` library to generate PNG barcode from the product's UPC
- Returns PNG with `Content-Type: image/png` and cache headers
- Fallback: 404 if product has no UPC

### 5. Frontend Libraries

- `jsbarcode` (npm) for client-side SVG barcode rendering
- `bwip-js` (npm, backend only) for server-side PNG generation

### 6. Frontend Components

#### A. ProductDetailPage.jsx (new)

Full page at route `/products/:id` with sections:
- **Header**: Product image, name, brand, model, UPC, data source badge
- **Barcode Panel**: SVG barcode via JsBarcode, all format numbers listed, "Download PNG" button
- **Attributes Panel**: All barcode_attributes in a clean key-value grid
- **Specifications Panel**: ce_specs data in key-value grid
- **Online Stores Panel**: OnlineStoresPanel component

#### B. OnlineStoresPanel.jsx (new, reusable)

Table displaying online retailers from competitor_prices:
- Columns: Store Name, Price, Sale Price, Availability, Condition, Country, Last Updated
- "View" button per row: opens retailer product_url in new browser tab
- Lowest price highlighted in green
- Empty state: "No online stores found for this product"

#### C. BarcodeDisplay.jsx (new, reusable)

- Renders SVG barcode via JsBarcode (UPC-A and EAN-13)
- Lists all barcode format numbers below the image
- "Download PNG" button that fetches from backend endpoint

#### D. ProductManagement.jsx (enhanced)

- Add expandable row per product showing:
  - Inline barcode image (small)
  - Quick store pricing summary (lowest price + store count)
  - "View Details" link to ProductDetailPage

### 7. Data Flow

```
Barcode Lookup API
    |
    v
normalizeBarcodeProduct()
    |-- barcode_formats -> products.barcode_formats
    |-- attributes -> products.barcode_attributes
    |-- stores[] -> competitor_prices (with competitor_url)
    |-- specs -> products.ce_specs
    |-- images -> products.image_url + ce_specs['Additional Images']
    v
ProductDetailPage
    |-- BarcodeDisplay (JsBarcode SVG + /api/products/:id/barcode.png)
    |-- Attributes grid (from barcode_attributes JSONB)
    |-- Specs grid (from ce_specs JSONB)
    |-- OnlineStoresPanel (from competitor_prices with links)
```

## Decisions

- Client-side SVG barcode rendering (JsBarcode) + server-side PNG (bwip-js) for print/export
- "View" links open retailer pages in new browser tab (no iframe)
- New dedicated Product Detail page + inline previews in product list
- Store all attribute data in JSONB (flexible, no migration needed when API adds fields)
- No new tables, just two new columns on products
