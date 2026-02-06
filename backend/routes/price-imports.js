/**
 * Price List Import Routes
 * Upload, parse, list, and retrieve vendor price list imports.
 * @module routes/price-imports
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'price-lists');

function init({ pool }) {
  const router = express.Router();

  // Ensure upload directory
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  // ---------- Multer configuration ----------
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const timestamp = Date.now();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${timestamp}_${safeName}`);
    },
  });

  const ALLOWED_MIMES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel', // xls
    'text/csv',
    'application/csv',
    'application/octet-stream', // fallback for some browsers
  ];
  const ALLOWED_EXTS = ['.xlsx', '.xls', '.csv'];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        return cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTS.join(', ')}`));
      }
      cb(null, true);
    },
  });

  // ---------- File parsing helpers ----------

  /**
   * Parse an Excel file and return headers + rows as arrays of arrays.
   */
  function parseExcel(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Filter out completely empty rows
    const nonEmpty = data.filter(row => row.some(cell => cell !== '' && cell != null));

    if (nonEmpty.length === 0) {
      return { headers: [], rows: [], totalRows: 0, columns: [] };
    }

    const headers = nonEmpty[0].map(h => (h != null ? String(h).trim() : ''));
    const rows = nonEmpty.slice(1);

    // Generate column letters (A, B, C, ... Z, AA, AB, ...)
    const columns = headers.map((_, i) => columnLetter(i));

    return { headers, rows, totalRows: rows.length, columns };
  }

  /**
   * Parse a CSV file and return headers + rows.
   */
  function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = null;

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('headers', h => { headers = h; })
        .on('data', row => {
          // Convert object row to array matching header order
          rows.push(headers.map(h => row[h] ?? ''));
        })
        .on('end', () => {
          if (!headers) {
            return resolve({ headers: [], rows: [], totalRows: 0, columns: [] });
          }
          const columns = headers.map((_, i) => columnLetter(i));
          resolve({ headers, rows, totalRows: rows.length, columns });
        })
        .on('error', reject);
    });
  }

  /**
   * Parse any supported file.
   */
  async function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.csv') return parseCSV(filePath);
    if (ext === '.xlsx' || ext === '.xls') return parseExcel(filePath);
    throw new Error(`Unsupported file type: ${ext}`);
  }

  /**
   * Convert zero-based column index to Excel-style letter (0=A, 25=Z, 26=AA).
   */
  function columnLetter(index) {
    let letter = '';
    let n = index;
    while (n >= 0) {
      letter = String.fromCharCode((n % 26) + 65) + letter;
      n = Math.floor(n / 26) - 1;
    }
    return letter;
  }

  // ==========================================================================
  // POST /api/price-imports/upload
  // ==========================================================================
  router.post(
    '/upload',
    authenticate,
    checkPermission('hub.products.import'),
    upload.single('file'),
    async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const { vendor_id, effective_from, effective_to } = req.body;

        // Validate vendor if provided
        if (vendor_id) {
          const vendorResult = await pool.query(
            'SELECT id, name FROM vendors WHERE id = $1 AND is_active = TRUE',
            [vendor_id]
          );
          if (vendorResult.rows.length === 0) {
            // Clean up uploaded file
            fs.unlink(req.file.path, () => {});
            return res.status(400).json({ success: false, message: 'Vendor not found or inactive' });
          }
        }

        // Parse the file
        let parsed;
        try {
          parsed = await parseFile(req.file.path);
        } catch (parseErr) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ success: false, message: `File parse error: ${parseErr.message}` });
        }

        if (parsed.totalRows === 0) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ success: false, message: 'File is empty or contains only headers' });
        }

        // Create price_list_imports record
        const importResult = await pool.query(
          `INSERT INTO price_list_imports
            (vendor_id, filename, file_path, file_size, status, total_rows,
             effective_from, effective_to, uploaded_by)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
           RETURNING id, vendor_id, filename, status, total_rows, effective_from, effective_to, created_at`,
          [
            vendor_id || null,
            req.file.originalname,
            req.file.path,
            req.file.size,
            parsed.totalRows,
            effective_from || null,
            effective_to || null,
            req.user.id,
          ]
        );

        const importRecord = importResult.rows[0];

        // Return response with column headers and sample rows
        const sampleRows = parsed.rows.slice(0, 5).map((row, i) => {
          const obj = {};
          parsed.columns.forEach((col, ci) => {
            obj[col] = row[ci] != null ? String(row[ci]) : '';
          });
          return { row_number: i + 2, data: obj }; // +2 because row 1 is headers
        });

        res.status(201).json({
          success: true,
          import_id: importRecord.id,
          filename: importRecord.filename,
          total_rows: importRecord.total_rows,
          columns: parsed.columns,
          headers: parsed.headers,
          sample_rows: sampleRows,
          vendor_id: importRecord.vendor_id,
          effective_from: importRecord.effective_from,
          effective_to: importRecord.effective_to,
        });
      } catch (err) {
        // Clean up file on unexpected errors
        if (req.file && req.file.path) {
          fs.unlink(req.file.path, () => {});
        }
        next(err);
      }
    }
  );

  // ---------- Currency parsing ----------

  /**
   * Parse a currency string to cents.
   * @param {*} value - Raw cell value
   * @param {string} format - 'dollars' (19.99) or 'cents' (1999)
   * @returns {number|null} Amount in cents, or null if unparseable
   */
  function parseCurrency(value, format) {
    if (value == null || value === '') return null;
    const str = String(value).replace(/[$,\s]/g, '');
    const num = parseFloat(str);
    if (isNaN(num)) return null;
    if (format === 'cents') return Math.round(num);
    return Math.round(num * 100); // dollars → cents
  }

  /**
   * Convert column letter to zero-based index (A=0, Z=25, AA=26).
   */
  function columnIndex(letter) {
    if (letter == null) return -1;
    let idx = 0;
    const upper = letter.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      idx = idx * 26 + (upper.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  /**
   * Extract a cell value from a row array using a column letter.
   */
  function cellValue(row, colLetter) {
    if (!colLetter) return undefined;
    const idx = columnIndex(colLetter);
    if (idx < 0 || idx >= row.length) return undefined;
    const v = row[idx];
    return v != null ? String(v).trim() : undefined;
  }

  // ---------- Product matching ----------

  async function findProductBySKU(sku) {
    if (!sku) return null;
    const trimmed = sku.trim();
    if (!trimmed) return null;

    // Exact SKU match
    let result = await pool.query(
      'SELECT id, sku, model, cost, price, name FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1',
      [trimmed]
    );
    if (result.rows.length > 0) return { ...result.rows[0], matchType: 'exact_sku' };

    // Exact model match
    result = await pool.query(
      'SELECT id, sku, model, cost, price, name FROM products WHERE LOWER(model) = LOWER($1) LIMIT 1',
      [trimmed]
    );
    if (result.rows.length > 0) return { ...result.rows[0], matchType: 'exact_model' };

    return null;
  }

  // ---------- Background validation job ----------

  async function validateImport(importId) {
    const importResult = await pool.query(
      'SELECT * FROM price_list_imports WHERE id = $1',
      [importId]
    );
    if (importResult.rows.length === 0) return;

    const imp = importResult.rows[0];
    const mapping = imp.column_mapping;
    const decimalFormat = mapping._decimal_format || 'dollars';
    const skipRows = mapping._skip_rows || 1;

    let fileData;
    try {
      fileData = await parseFile(imp.file_path);
    } catch (err) {
      await pool.query(
        "UPDATE price_list_imports SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
        [`File parse error: ${err.message}`, importId]
      );
      return;
    }

    // Delete any previous validation rows for re-validation
    await pool.query('DELETE FROM price_list_import_rows WHERE import_id = $1', [importId]);

    const dataRows = fileData.rows.slice(skipRows - 1); // skipRows=1 means first data row is index 0 (headers already stripped)
    let rowsProcessed = 0;
    let rowsValid = 0;
    let rowsWarning = 0;
    let rowsErrored = 0;
    let rowsMatched = 0;
    let rowsNew = 0;

    // Process in batches for large files
    const BATCH_SIZE = 100;
    for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
      const batch = dataRows.slice(batchStart, batchStart + BATCH_SIZE);

      const insertValues = [];
      const insertParams = [];
      let paramIdx = 1;

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const rowNum = batchStart + i + skipRows + 1; // 1-based, accounting for header

        // Extract values based on mapping
        const parsedSku = cellValue(row, mapping.sku) || '';
        const parsedDesc = cellValue(row, mapping.description) || null;
        const parsedCost = parseCurrency(cellValue(row, mapping.cost), decimalFormat);
        const parsedMsrp = mapping.msrp ? parseCurrency(cellValue(row, mapping.msrp), decimalFormat) : null;
        const parsedPromo = mapping.promo_price ? parseCurrency(cellValue(row, mapping.promo_price), decimalFormat) : null;

        // Validate
        const errors = [];
        const warnings = [];

        if (!parsedSku) errors.push('SKU is required');
        if (parsedCost == null || parsedCost <= 0) errors.push('Valid cost is required');
        if (parsedMsrp != null && parsedCost != null && parsedMsrp < parsedCost) {
          warnings.push('MSRP is less than cost');
        }
        if (parsedPromo != null && parsedMsrp != null && parsedPromo > parsedMsrp) {
          warnings.push('Promo price is higher than MSRP');
        }

        // Match existing product
        let matchedProduct = null;
        let matchType = 'new';
        if (parsedSku) {
          matchedProduct = await findProductBySKU(parsedSku);
          if (matchedProduct) matchType = matchedProduct.matchType;
        }

        // Calculate price changes (products store dollars, we have cents)
        let previousCost = null;
        let previousMsrp = null;
        let costChange = null;
        let msrpChange = null;
        if (matchedProduct) {
          previousCost = matchedProduct.cost != null ? Math.round(parseFloat(matchedProduct.cost) * 100) : null;
          previousMsrp = matchedProduct.price != null ? Math.round(parseFloat(matchedProduct.price) * 100) : null;
          if (previousCost != null && parsedCost != null) costChange = parsedCost - previousCost;
          if (previousMsrp != null && parsedMsrp != null) msrpChange = parsedMsrp - previousMsrp;
        }

        const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

        // Build raw_data object keyed by column letter
        const rawData = {};
        fileData.columns.forEach((col, ci) => {
          rawData[col] = row[ci] != null ? String(row[ci]) : '';
        });

        // Collect parameterized values
        const base = paramIdx;
        insertValues.push(
          `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ` +
          `$${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, ` +
          `$${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, ` +
          `$${base + 15})`
        );
        insertParams.push(
          importId,               // import_id
          rowNum,                 // row_number
          JSON.stringify(rawData),// raw_data
          parsedSku || null,      // parsed_sku
          parsedDesc,             // parsed_description
          parsedCost,             // parsed_cost
          parsedMsrp,             // parsed_msrp
          parsedPromo,            // parsed_promo_price
          matchedProduct ? matchedProduct.id : null, // matched_product_id
          matchType,              // match_type
          status,                 // status
          errors.length > 0 ? JSON.stringify(errors) : null,     // validation_errors
          warnings.length > 0 ? JSON.stringify(warnings) : null, // validation_warnings
          previousCost,           // previous_cost
          previousMsrp,           // previous_msrp
          costChange              // cost_change
        );
        paramIdx += 16;

        if (status === 'error') rowsErrored++;
        else if (status === 'warning') rowsWarning++;
        else rowsValid++;

        if (matchedProduct) rowsMatched++;
        else if (parsedSku) rowsNew++;

        rowsProcessed++;
      }

      // Bulk insert batch
      if (insertValues.length > 0) {
        await pool.query(
          `INSERT INTO price_list_import_rows
            (import_id, row_number, raw_data, parsed_sku, parsed_description,
             parsed_cost, parsed_msrp, parsed_promo_price, matched_product_id, match_type,
             status, validation_errors, validation_warnings, previous_cost, previous_msrp,
             cost_change)
           VALUES ${insertValues.join(', ')}`,
          insertParams
        );
      }

      // Update progress
      await pool.query(
        'UPDATE price_list_imports SET rows_processed = $1 WHERE id = $2',
        [rowsProcessed, importId]
      );
    }

    // Finalize
    await pool.query(
      `UPDATE price_list_imports SET
        status = 'preview',
        rows_processed = $1,
        rows_updated = $2,
        rows_created = $3,
        rows_errored = $4,
        completed_at = NOW()
       WHERE id = $5`,
      [rowsProcessed, rowsMatched, rowsNew, rowsErrored, importId]
    );
  }

  // ==========================================================================
  // POST /api/price-imports/:id/mapping
  // ==========================================================================
  router.post(
    '/:id/mapping',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { column_mapping, skip_rows = 1, decimal_format = 'dollars' } = req.body;

        // Fetch import
        const importResult = await pool.query(
          'SELECT id, status, file_path FROM price_list_imports WHERE id = $1',
          [id]
        );
        if (importResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }

        const imp = importResult.rows[0];

        // Only allow mapping from pending or mapping status
        if (!['pending', 'mapping'].includes(imp.status)) {
          return res.status(400).json({
            success: false,
            message: `Cannot set mapping when import status is '${imp.status}'. Must be 'pending' or 'mapping'.`,
          });
        }

        // Validate column_mapping
        if (!column_mapping || typeof column_mapping !== 'object') {
          return res.status(400).json({ success: false, message: 'column_mapping is required and must be an object' });
        }

        if (!column_mapping.sku) {
          return res.status(400).json({ success: false, message: 'column_mapping.sku is required' });
        }
        if (!column_mapping.cost) {
          return res.status(400).json({ success: false, message: 'column_mapping.cost is required' });
        }

        // Validate column letters are valid (A-ZZ)
        const validColPattern = /^[A-Z]{1,3}$/;
        for (const [key, value] of Object.entries(column_mapping)) {
          if (value && !validColPattern.test(value.toUpperCase())) {
            return res.status(400).json({
              success: false,
              message: `Invalid column letter for '${key}': '${value}'`,
            });
          }
        }

        // Validate decimal_format
        if (!['dollars', 'cents'].includes(decimal_format)) {
          return res.status(400).json({
            success: false,
            message: "decimal_format must be 'dollars' or 'cents'",
          });
        }

        // Validate skip_rows
        const skipRowsInt = parseInt(skip_rows, 10);
        if (isNaN(skipRowsInt) || skipRowsInt < 0) {
          return res.status(400).json({
            success: false,
            message: 'skip_rows must be a non-negative integer',
          });
        }

        // Store mapping with metadata
        const fullMapping = {
          ...column_mapping,
          _skip_rows: skipRowsInt,
          _decimal_format: decimal_format,
        };

        // Update import record
        await pool.query(
          "UPDATE price_list_imports SET column_mapping = $1, status = 'validating', started_at = NOW() WHERE id = $2",
          [JSON.stringify(fullMapping), id]
        );

        // Respond immediately, kick off validation async
        res.json({ success: true, status: 'validating', import_id: parseInt(id, 10) });

        // Run validation in background
        validateImport(parseInt(id, 10)).catch(err => {
          console.error(`[PriceImport] Validation failed for import ${id}:`, err);
          pool.query(
            "UPDATE price_list_imports SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
            [err.message, id]
          ).catch(() => {});
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports/:id/preview
  // ==========================================================================
  router.get(
    '/:id/preview',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { page = 1, limit = 50, status_filter = 'all' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        // Fetch import
        const impResult = await pool.query(
          `SELECT pli.*, v.name AS vendor_name, v.code AS vendor_code
           FROM price_list_imports pli
           LEFT JOIN vendors v ON pli.vendor_id = v.id
           WHERE pli.id = $1`,
          [id]
        );
        if (impResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }
        const imp = impResult.rows[0];

        if (!['preview', 'validating', 'importing', 'completed'].includes(imp.status)) {
          return res.status(400).json({
            success: false,
            message: `Preview not available. Import status is '${imp.status}'. Validation must complete first.`,
          });
        }

        // Build summary from DB aggregates
        const summaryResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total_rows,
             COUNT(*) FILTER (WHERE status = 'valid')::int AS valid,
             COUNT(*) FILTER (WHERE status = 'warning')::int AS warnings,
             COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
             COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
             COUNT(*) FILTER (WHERE match_type = 'new')::int AS new_products,
             COUNT(*) FILTER (WHERE cost_change > 0)::int AS price_increases,
             COUNT(*) FILTER (WHERE cost_change < 0)::int AS price_decreases,
             COUNT(*) FILTER (WHERE cost_change = 0 AND matched_product_id IS NOT NULL)::int AS no_change
           FROM price_list_import_rows
           WHERE import_id = $1`,
          [id]
        );
        const summary = summaryResult.rows[0];

        // Fetch rows with optional status filter
        const conditions = ['r.import_id = $1'];
        const params = [id];
        let paramIdx = 2;

        if (status_filter && status_filter !== 'all') {
          conditions.push(`r.status = $${paramIdx++}`);
          params.push(status_filter);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM price_list_import_rows r WHERE ${whereClause}`,
          params
        );
        const totalFiltered = countResult.rows[0].count;

        const rowsResult = await pool.query(
          `SELECT
             r.row_number,
             r.parsed_sku AS sku,
             r.parsed_description AS description,
             r.previous_cost AS current_cost,
             r.parsed_cost AS new_cost,
             r.cost_change,
             r.previous_msrp AS current_msrp,
             r.parsed_msrp AS new_msrp,
             r.msrp_change,
             r.match_type,
             r.status,
             r.validation_warnings AS warnings,
             r.validation_errors AS errors,
             r.matched_product_id,
             p.name AS matched_product_name
           FROM price_list_import_rows r
           LEFT JOIN products p ON r.matched_product_id = p.id
           WHERE ${whereClause}
           ORDER BY r.row_number
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          import_id: parseInt(id, 10),
          status: imp.status,
          vendor: imp.vendor_name ? { id: imp.vendor_id, name: imp.vendor_name, code: imp.vendor_code } : null,
          summary,
          rows: rowsResult.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: totalFiltered,
            total_pages: Math.ceil(totalFiltered / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports/:id/simulation
  // ==========================================================================
  router.get(
    '/:id/simulation',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        // Fetch import
        const impResult = await pool.query(
          'SELECT id, status, vendor_id, filename FROM price_list_imports WHERE id = $1',
          [id]
        );
        if (impResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }
        const imp = impResult.rows[0];

        if (!['preview', 'completed'].includes(imp.status)) {
          return res.status(400).json({
            success: false,
            message: `Simulation not available. Import status is '${imp.status}'. Must be in 'preview' status.`,
          });
        }

        // ---- Overall summary ----
        const overallResult = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE matched_product_id IS NOT NULL)::int AS products_affected,
             COUNT(*) FILTER (WHERE match_type = 'new')::int AS new_products,

             -- Cost changes
             COUNT(*) FILTER (WHERE cost_change > 0)::int AS cost_increases_count,
             COALESCE(SUM(cost_change) FILTER (WHERE cost_change > 0), 0)::int AS cost_increases_total,
             COUNT(*) FILTER (WHERE cost_change < 0)::int AS cost_decreases_count,
             COALESCE(SUM(cost_change) FILTER (WHERE cost_change < 0), 0)::int AS cost_decreases_total,
             COUNT(*) FILTER (WHERE cost_change = 0 AND matched_product_id IS NOT NULL)::int AS cost_no_change,

             -- MSRP changes
             COUNT(*) FILTER (WHERE msrp_change > 0)::int AS msrp_increases_count,
             COALESCE(SUM(msrp_change) FILTER (WHERE msrp_change > 0), 0)::int AS msrp_increases_total,
             COUNT(*) FILTER (WHERE msrp_change < 0)::int AS msrp_decreases_count,
             COALESCE(SUM(msrp_change) FILTER (WHERE msrp_change < 0), 0)::int AS msrp_decreases_total,
             COUNT(*) FILTER (WHERE msrp_change = 0 AND matched_product_id IS NOT NULL AND parsed_msrp IS NOT NULL)::int AS msrp_no_change
           FROM price_list_import_rows
           WHERE import_id = $1 AND status IN ('valid', 'warning')`,
          [id]
        );
        const s = overallResult.rows[0];

        // ---- Margin impact ----
        // Margin improved: cost went down OR msrp went up (with the other not worsening)
        // Margin reduced: cost went up OR msrp went down
        const marginResult = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE
               matched_product_id IS NOT NULL
               AND parsed_msrp IS NOT NULL
               AND previous_msrp IS NOT NULL
               AND previous_cost IS NOT NULL
               AND (parsed_msrp - parsed_cost) > (previous_msrp - previous_cost)
             )::int AS improved,
             COUNT(*) FILTER (WHERE
               matched_product_id IS NOT NULL
               AND parsed_msrp IS NOT NULL
               AND previous_msrp IS NOT NULL
               AND previous_cost IS NOT NULL
               AND (parsed_msrp - parsed_cost) < (previous_msrp - previous_cost)
             )::int AS reduced,
             COUNT(*) FILTER (WHERE
               matched_product_id IS NOT NULL
               AND parsed_msrp IS NOT NULL
               AND previous_msrp IS NOT NULL
               AND previous_cost IS NOT NULL
               AND (parsed_msrp - parsed_cost) = (previous_msrp - previous_cost)
             )::int AS unchanged
           FROM price_list_import_rows
           WHERE import_id = $1 AND status IN ('valid', 'warning')`,
          [id]
        );
        const margin = marginResult.rows[0];

        // ---- Largest cost changes (top 10 by absolute change) ----
        const largestResult = await pool.query(
          `SELECT
             r.parsed_sku AS sku,
             r.parsed_description AS description,
             r.cost_change,
             CASE
               WHEN r.previous_cost > 0 THEN ROUND((r.cost_change::numeric / r.previous_cost) * 100, 1)
               ELSE NULL
             END AS percent_change,
             r.previous_cost AS current_cost,
             r.parsed_cost AS new_cost,
             p.name AS product_name
           FROM price_list_import_rows r
           LEFT JOIN products p ON r.matched_product_id = p.id
           WHERE r.import_id = $1
             AND r.cost_change IS NOT NULL
             AND r.cost_change != 0
             AND r.status IN ('valid', 'warning')
           ORDER BY ABS(r.cost_change) DESC
           LIMIT 10`,
          [id]
        );

        // ---- Warnings summary (aggregate by message) ----
        const warningsResult = await pool.query(
          `SELECT warning_msg, COUNT(*)::int AS count
           FROM price_list_import_rows,
                LATERAL jsonb_array_elements_text(validation_warnings) AS warning_msg
           WHERE import_id = $1 AND validation_warnings IS NOT NULL
           GROUP BY warning_msg
           ORDER BY count DESC`,
          [id]
        );
        const warningsSummary = {};
        warningsResult.rows.forEach(r => { warningsSummary[r.warning_msg] = r.count; });

        // ---- Errors summary (aggregate by message) ----
        const errorsResult = await pool.query(
          `SELECT error_msg, COUNT(*)::int AS count
           FROM price_list_import_rows,
                LATERAL jsonb_array_elements_text(validation_errors) AS error_msg
           WHERE import_id = $1 AND validation_errors IS NOT NULL
           GROUP BY error_msg
           ORDER BY count DESC`,
          [id]
        );
        const errorsSummary = {};
        errorsResult.rows.forEach(r => { errorsSummary[r.error_msg] = r.count; });

        res.json({
          success: true,
          import_id: parseInt(id, 10),
          summary: {
            products_affected: s.products_affected,
            new_products: s.new_products,

            cost_changes: {
              increases: { count: s.cost_increases_count, total_amount: s.cost_increases_total },
              decreases: { count: s.cost_decreases_count, total_amount: s.cost_decreases_total },
              no_change: { count: s.cost_no_change },
            },

            msrp_changes: {
              increases: { count: s.msrp_increases_count, total_amount: s.msrp_increases_total },
              decreases: { count: s.msrp_decreases_count, total_amount: s.msrp_decreases_total },
              no_change: { count: s.msrp_no_change },
            },

            margin_impact: {
              improved: margin.improved,
              reduced: margin.reduced,
              unchanged: margin.unchanged,
            },
          },

          largest_changes: largestResult.rows,
          warnings_summary: warningsSummary,
          errors_summary: errorsSummary,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports/:id/rows
  // ==========================================================================
  router.get(
    '/:id/rows',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const {
          status: filterStatus,
          match_type,
          page = 1,
          limit = 50,
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        // Verify import exists
        const impResult = await pool.query(
          'SELECT id FROM price_list_imports WHERE id = $1',
          [id]
        );
        if (impResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }

        const conditions = ['r.import_id = $1'];
        const params = [id];
        let paramIdx = 2;

        if (filterStatus) {
          conditions.push(`r.status = $${paramIdx++}`);
          params.push(filterStatus);
        }
        if (match_type) {
          conditions.push(`r.match_type = $${paramIdx++}`);
          params.push(match_type);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM price_list_import_rows r WHERE ${whereClause}`,
          params
        );
        const totalCount = countResult.rows[0].count;

        const result = await pool.query(
          `SELECT r.*, p.name AS matched_product_name, p.sku AS matched_product_sku
           FROM price_list_import_rows r
           LEFT JOIN products p ON r.matched_product_id = p.id
           WHERE ${whereClause}
           ORDER BY r.row_number
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          rows: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------- Import commit job ----------

  // Track cancellation requests in memory (keyed by import id)
  const cancelledImports = new Set();

  async function commitImport(importId, options, userId) {
    const { skip_errors = false, apply_to_effective_date = true } = options;

    const impResult = await pool.query('SELECT * FROM price_list_imports WHERE id = $1', [importId]);
    if (impResult.rows.length === 0) throw new Error('Import not found');
    const imp = impResult.rows[0];

    // Determine which row statuses to process
    const allowedStatuses = ['valid', 'warning'];

    // Fetch processable rows
    const rowsResult = await pool.query(
      `SELECT * FROM price_list_import_rows
       WHERE import_id = $1 AND status = ANY($2)
       ORDER BY row_number`,
      [importId, allowedStatuses]
    );
    const rows = rowsResult.rows;

    const effectiveFrom = apply_to_effective_date && imp.effective_from ? imp.effective_from : null;

    // Use a client from the pool for transaction
    const client = await pool.connect();
    let rowsUpdated = 0;
    let rowsCreated = 0;
    let rowsSkipped = 0;
    let rowsProcessed = 0;

    try {
      await client.query('BEGIN');

      for (const row of rows) {
        // Check for cancellation
        if (cancelledImports.has(importId)) {
          await client.query('ROLLBACK');
          await pool.query(
            "UPDATE price_list_imports SET status = 'cancelled', completed_at = NOW(), error_message = 'Cancelled by user' WHERE id = $1",
            [importId]
          );
          cancelledImports.delete(importId);
          return;
        }

        if (row.matched_product_id) {
          // Fetch current product values for history
          const prodResult = await client.query(
            'SELECT cost, price FROM products WHERE id = $1',
            [row.matched_product_id]
          );
          const currentProduct = prodResult.rows[0];

          // Convert cents to dollars for products table
          const newCostDollars = row.parsed_cost != null ? (row.parsed_cost / 100).toFixed(2) : null;
          const newPriceDollars = row.parsed_msrp != null ? (row.parsed_msrp / 100).toFixed(2) : null;

          // Build update fields
          const updateFields = ['cost_updated_at = NOW()', 'cost_updated_by = $2', 'last_price_import_id = $3'];
          const updateParams = [row.matched_product_id, userId, importId];
          let paramIdx = 4;

          if (newCostDollars != null) {
            updateFields.push(`cost = $${paramIdx++}`);
            updateParams.push(newCostDollars);
          }
          if (newPriceDollars != null) {
            updateFields.push(`price = $${paramIdx++}`);
            updateParams.push(newPriceDollars);
          }

          await client.query(
            `UPDATE products SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $1`,
            updateParams
          );

          // Create price history record (both dollar and cents columns)
          const prevCostCents = currentProduct && currentProduct.cost != null ? Math.round(parseFloat(currentProduct.cost) * 100) : null;
          const prevPriceCents = currentProduct && currentProduct.price != null ? Math.round(parseFloat(currentProduct.price) * 100) : null;

          await client.query(
            `INSERT INTO product_price_history
              (product_id, previous_cost, new_cost, previous_price, new_price,
               cost, retail_price, promo_price,
               source, source_id, effective_from, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'import', $9, $10, $11)`,
            [
              row.matched_product_id,
              currentProduct ? currentProduct.cost : null,
              newCostDollars,
              currentProduct ? currentProduct.price : null,
              newPriceDollars,
              row.parsed_cost,            // cents
              row.parsed_msrp,            // cents
              row.parsed_promo_price,     // cents
              importId,
              effectiveFrom || new Date(),
              userId,
            ]
          );

          // Mark row as imported
          await client.query(
            "UPDATE price_list_import_rows SET status = 'imported' WHERE id = $1",
            [row.id]
          );
          rowsUpdated++;

        } else if (row.match_type === 'new') {
          // New products are skipped — require manual creation
          await client.query(
            `UPDATE price_list_import_rows
             SET status = 'skipped',
                 validation_warnings = COALESCE(validation_warnings, '[]'::jsonb) || '"New product - manual creation required"'::jsonb
             WHERE id = $1`,
            [row.id]
          );
          rowsSkipped++;
        } else {
          // No match, skip
          await client.query(
            "UPDATE price_list_import_rows SET status = 'skipped' WHERE id = $1",
            [row.id]
          );
          rowsSkipped++;
        }

        rowsProcessed++;

        // Update progress every 50 rows
        if (rowsProcessed % 50 === 0) {
          await client.query(
            'UPDATE price_list_imports SET rows_processed = $1 WHERE id = $2',
            [rowsProcessed, importId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Count error rows
    const errorCount = await pool.query(
      "SELECT COUNT(*)::int FROM price_list_import_rows WHERE import_id = $1 AND status = 'error'",
      [importId]
    );

    // Update final statistics
    await pool.query(
      `UPDATE price_list_imports SET
         status = 'completed',
         completed_at = NOW(),
         rows_processed = $1,
         rows_updated = $2,
         rows_created = $3,
         rows_skipped = $4,
         rows_errored = $5,
         approved_by = $6
       WHERE id = $7`,
      [rowsProcessed, rowsUpdated, rowsCreated, rowsSkipped, errorCount.rows[0].count, userId, importId]
    );
  }

  // ==========================================================================
  // POST /api/price-imports/:id/commit
  // ==========================================================================
  router.post(
    '/:id/commit',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { skip_errors = false, apply_to_effective_date = true } = req.body;

        // Fetch import
        const impResult = await pool.query(
          'SELECT id, status, total_rows FROM price_list_imports WHERE id = $1',
          [id]
        );
        if (impResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }
        const imp = impResult.rows[0];

        if (imp.status !== 'preview') {
          return res.status(400).json({
            success: false,
            message: `Cannot commit import with status '${imp.status}'. Must be 'preview'.`,
          });
        }

        // Check for errors if skip_errors is false
        if (!skip_errors) {
          const errorCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM price_list_import_rows WHERE import_id = $1 AND status = 'error'",
            [id]
          );
          if (errorCount.rows[0].count > 0) {
            return res.status(400).json({
              success: false,
              message: `Import has ${errorCount.rows[0].count} error rows. Set skip_errors: true to import valid rows only, or fix errors first.`,
              error_count: errorCount.rows[0].count,
            });
          }
        }

        // Set status to importing and reset progress
        await pool.query(
          "UPDATE price_list_imports SET status = 'importing', rows_processed = 0, started_at = NOW() WHERE id = $1",
          [id]
        );

        // Respond immediately
        res.json({
          success: true,
          status: 'importing',
          import_id: parseInt(id, 10),
          total_rows: imp.total_rows,
        });

        // Run commit in background
        commitImport(parseInt(id, 10), { skip_errors, apply_to_effective_date }, req.user.id).catch(err => {
          console.error(`[PriceImport] Commit failed for import ${id}:`, err);
          pool.query(
            "UPDATE price_list_imports SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
            [err.message, id]
          ).catch(() => {});
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports/:id/progress
  // ==========================================================================
  router.get(
    '/:id/progress',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `SELECT id, status, total_rows, rows_processed, rows_updated, rows_created,
                  rows_skipped, rows_errored, started_at, completed_at, error_message
           FROM price_list_imports WHERE id = $1`,
          [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }

        const imp = result.rows[0];
        const totalRows = imp.total_rows || 1;
        const processed = imp.rows_processed || 0;
        const percentComplete = Math.min(100, Math.round((processed / totalRows) * 100));

        res.json({
          success: true,
          import_id: imp.id,
          status: imp.status,
          total_rows: imp.total_rows,
          rows_processed: processed,
          rows_updated: imp.rows_updated,
          rows_created: imp.rows_created,
          rows_skipped: imp.rows_skipped,
          rows_errored: imp.rows_errored,
          percent_complete: percentComplete,
          started_at: imp.started_at,
          completed_at: imp.completed_at,
          error_message: imp.error_message,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/price-imports/:id/cancel
  // ==========================================================================
  router.post(
    '/:id/cancel',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          'SELECT id, status FROM price_list_imports WHERE id = $1',
          [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }

        const imp = result.rows[0];

        if (imp.status === 'completed') {
          return res.status(400).json({
            success: false,
            message: 'Cannot cancel a completed import.',
          });
        }

        if (imp.status === 'cancelled') {
          return res.json({ success: true, status: 'cancelled', message: 'Import is already cancelled.' });
        }

        if (imp.status === 'importing') {
          // Signal the background job to stop — it checks cancelledImports set each iteration
          cancelledImports.add(parseInt(id, 10));
          return res.json({
            success: true,
            status: 'cancelling',
            message: 'Cancellation requested. In-progress import will be rolled back.',
          });
        }

        // For pending/mapping/validating/preview/failed — cancel immediately
        await pool.query(
          "UPDATE price_list_imports SET status = 'cancelled', completed_at = NOW(), error_message = 'Cancelled by user' WHERE id = $1",
          [id]
        );

        res.json({ success: true, status: 'cancelled', import_id: parseInt(id, 10) });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { status, vendor_id, date_from, date_to, page = 1, limit = 25 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (status) {
          conditions.push(`pli.status = $${paramIdx++}`);
          params.push(status);
        }
        if (vendor_id) {
          conditions.push(`pli.vendor_id = $${paramIdx++}`);
          params.push(parseInt(vendor_id, 10));
        }
        if (date_from) {
          conditions.push(`pli.created_at >= $${paramIdx++}`);
          params.push(date_from);
        }
        if (date_to) {
          conditions.push(`pli.created_at <= $${paramIdx++}::date + INTERVAL '1 day'`);
          params.push(date_to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count
        const countResult = await pool.query(
          `SELECT COUNT(*) FROM price_list_imports pli ${whereClause}`,
          params
        );
        const totalCount = parseInt(countResult.rows[0].count, 10);

        // Fetch
        const result = await pool.query(
          `SELECT pli.*,
                  v.name AS vendor_name, v.code AS vendor_code,
                  u.first_name || ' ' || u.last_name AS uploaded_by_name
           FROM price_list_imports pli
           LEFT JOIN vendors v ON pli.vendor_id = v.id
           LEFT JOIN users u ON pli.uploaded_by = u.id
           ${whereClause}
           ORDER BY pli.created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          imports: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-imports/:id
  // ==========================================================================
  router.get(
    '/:id',
    authenticate,
    checkPermission('hub.products.import'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `SELECT pli.*,
                  v.name AS vendor_name, v.code AS vendor_code,
                  u.first_name || ' ' || u.last_name AS uploaded_by_name,
                  u2.first_name || ' ' || u2.last_name AS approved_by_name
           FROM price_list_imports pli
           LEFT JOIN vendors v ON pli.vendor_id = v.id
           LEFT JOIN users u ON pli.uploaded_by = u.id
           LEFT JOIN users u2 ON pli.approved_by = u2.id
           WHERE pli.id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Import not found' });
        }

        const importRecord = result.rows[0];

        // Get row status summary
        const statsSql = `
          SELECT status, COUNT(*)::int AS count
          FROM price_list_import_rows
          WHERE import_id = $1
          GROUP BY status
        `;
        const statsResult = await pool.query(statsSql, [id]);
        const rowStats = {};
        statsResult.rows.forEach(r => { rowStats[r.status] = r.count; });

        res.json({
          success: true,
          import: {
            ...importRecord,
            row_stats: rowStats,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
