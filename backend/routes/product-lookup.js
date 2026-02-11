const express = require('express');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  const router = express.Router();

  /**
   * GET /api/products/lookup
   * Lookup product by barcode/UPC/SKU for POS scanning
   *
   * Query: barcode (UPC, EAN, SKU, model)
   *
   * Returns product or 404
   */
  router.get('/lookup', asyncHandler(async (req, res) => {
    const { barcode } = req.query;
    if (!barcode || barcode.length < 3) {
      throw ApiError.badRequest('Barcode/SKU required (min 3 chars)');
    }

    const code = barcode.trim();

    // 1. Try exact match on barcode/upc field
    let { rows: [product] } = await pool.query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE (p.barcode = $1 OR p.upc = $1) AND p.deleted_at IS NULL AND p.is_active = true
       LIMIT 1`,
      [code]
    );

    if (product) {
      return res.json({ product, match_type: 'barcode' });
    }

    // 2. Try exact match on SKU
    ({ rows: [product] } = await pool.query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.sku = $1 AND p.deleted_at IS NULL AND p.is_active = true
       LIMIT 1`,
      [code]
    ));

    if (product) {
      return res.json({ product, match_type: 'sku' });
    }

    // 3. Try SKU without leading zeros (common scanner quirk)
    const trimmedCode = code.replace(/^0+/, '');
    if (trimmedCode !== code && trimmedCode.length >= 3) {
      ({ rows: [product] } = await pool.query(
        `SELECT p.*, c.name AS category_name, b.name AS brand_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE p.sku = $1 AND p.deleted_at IS NULL AND p.is_active = true
         LIMIT 1`,
        [trimmedCode]
      ));

      if (product) {
        return res.json({ product, match_type: 'sku_trimmed' });
      }
    }

    // 4. Try model number match
    ({ rows: [product] } = await pool.query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.model = $1 AND p.deleted_at IS NULL AND p.is_active = true
       LIMIT 1`,
      [code]
    ));

    if (product) {
      return res.json({ product, match_type: 'model' });
    }

    // 5. Try case-insensitive SKU match
    ({ rows: [product] } = await pool.query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE LOWER(p.sku) = LOWER($1) AND p.deleted_at IS NULL AND p.is_active = true
       LIMIT 1`,
      [code]
    ));

    if (product) {
      return res.json({ product, match_type: 'sku_icase' });
    }

    // Not found
    throw ApiError.notFound('Product');
  }));

  /**
   * POST /api/products/lookup/batch
   * Batch lookup for receiving workflow
   * Body: { barcodes: ['123', '456'] }
   */
  router.post('/lookup/batch', asyncHandler(async (req, res) => {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      throw ApiError.badRequest('barcodes array required');
    }

    const results = { found: [], not_found: [] };

    for (const code of barcodes) {
      const { rows: [product] } = await pool.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.model
         FROM products p
         WHERE (p.barcode = $1 OR p.upc = $1 OR p.sku = $1 OR p.model = $1)
           AND p.deleted_at IS NULL
         LIMIT 1`,
        [code.trim()]
      );

      if (product) {
        results.found.push({ barcode: code, product });
      } else {
        results.not_found.push(code);
      }
    }

    res.json(results);
  }));

  return router;
}

module.exports = { init };
