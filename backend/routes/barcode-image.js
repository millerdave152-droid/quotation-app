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
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(png);
}));

module.exports = { router, init };
