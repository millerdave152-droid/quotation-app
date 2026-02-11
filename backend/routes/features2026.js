/**
 * 2026 Features API Routes
 * Includes: Special Orders, E-Signatures, Customer Portal, Quote Templates,
 * Quote Versioning, Mobile Preview, Follow-ups, Payments, Attachments, Price Book
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = (pool) => {

  // =====================================================
  // 1. SPECIAL ORDERS / NON-STOCK PRODUCTS
  // =====================================================

  // Get products with stock status
  router.get('/products/stock-status', authenticate, asyncHandler(async (req, res) => {
    const { in_stock, orderable } = req.query;
    let query = `
      SELECT id, manufacturer, model, name, description, category,
             cost_cents, msrp_cents, in_stock, lead_time_days,
             orderable_from_manufacturer, stock_status, estimated_arrival_date
      FROM products WHERE 1=1
    `;
    const params = [];

    if (in_stock !== undefined) {
      params.push(in_stock === 'true');
      query += ` AND in_stock = $${params.length}`;
    }
    if (orderable !== undefined) {
      params.push(orderable === 'true');
      query += ` AND orderable_from_manufacturer = $${params.length}`;
    }

    query += ' ORDER BY manufacturer, model LIMIT 500';
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  // Update product stock status
  router.put('/products/:id/stock', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { in_stock, lead_time_days, orderable_from_manufacturer, stock_status, estimated_arrival_date } = req.body;

    const result = await pool.query(`
      UPDATE products SET
        in_stock = COALESCE($1, in_stock),
        lead_time_days = COALESCE($2, lead_time_days),
        orderable_from_manufacturer = COALESCE($3, orderable_from_manufacturer),
        stock_status = COALESCE($4, stock_status),
        estimated_arrival_date = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [in_stock, lead_time_days, orderable_from_manufacturer, stock_status, estimated_arrival_date, id]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Product');
    }
    res.json(result.rows[0]);
  }));

  // Bulk update stock status
  router.post('/products/bulk-stock-update', authenticate, asyncHandler(async (req, res) => {
    const { product_ids, updates } = req.body;

    const result = await pool.query(`
      UPDATE products SET
        in_stock = COALESCE($1, in_stock),
        lead_time_days = COALESCE($2, lead_time_days),
        stock_status = COALESCE($3, stock_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($4)
      RETURNING id
    `, [updates.in_stock, updates.lead_time_days, updates.stock_status, product_ids]);

    res.json({ updated: result.rowCount });
  }));

  // =====================================================
  // 2. E-SIGNATURE INTEGRATION
  // =====================================================

  // Generate acceptance token for quote
  router.post('/quotes/:id/generate-acceptance-link', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await pool.query(`
      INSERT INTO quote_acceptance_tokens (quote_id, token, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (quote_id) WHERE used_at IS NULL
      DO UPDATE SET token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP
    `, [id, token, expiresAt]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const acceptanceLink = `${baseUrl}/accept-quote/${token}`;

    res.json({ token, acceptanceLink, expiresAt });
  }));

  // Verify acceptance token
  router.get('/quotes/verify-token/:token', authenticate, asyncHandler(async (req, res) => {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT t.*, q.*, c.name as customer_name, c.email as customer_email
      FROM quote_acceptance_tokens t
      JOIN quotations q ON t.quote_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE t.token = $1 AND t.expires_at > NOW() AND t.used_at IS NULL
    `, [token]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Token');
    }

    // Get quote items
    const items = await pool.query(`
      SELECT qi.*, p.manufacturer, p.model, p.description
      FROM quote_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [result.rows[0].quote_id]);

    res.json({ quote: result.rows[0], items: items.rows });
  }));

  // Submit signature
  router.post('/quotes/:id/sign', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { signature_data, signer_name, signer_email, token, legal_text } = req.body;
    const signer_ip = req.ip || req.connection.remoteAddress;

    // Verify token
    const tokenResult = await pool.query(`
      SELECT * FROM quote_acceptance_tokens
      WHERE quote_id = $1 AND token = $2 AND expires_at > NOW() AND used_at IS NULL
    `, [id, token]);

    if (tokenResult.rows.length === 0) {
      throw ApiError.badRequest('Invalid or expired token');
    }

    // Save signature
    await pool.query(`
      INSERT INTO quote_signatures (quote_id, signature_data, signer_name, signer_email, signer_ip, legal_text)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, signature_data, signer_name, signer_email, signer_ip, legal_text]);

    // Mark token as used
    await pool.query(`
      UPDATE quote_acceptance_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [tokenResult.rows[0].id]);

    // Update quote status
    await pool.query(`
      UPDATE quotations SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);

    res.json({ success: true, message: 'Quote signed and accepted' });
  }));

  // Get quote signatures
  router.get('/quotes/:id/signatures', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM quote_signatures WHERE quote_id = $1 ORDER BY signed_at DESC
    `, [id]);
    res.json(result.rows);
  }));

  // =====================================================
  // 3. CUSTOMER PORTAL
  // =====================================================

  // Generate portal access for customer
  router.post('/customers/:id/portal-access', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const accessToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await pool.query(`
      INSERT INTO customer_portal_access (customer_id, access_token, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (customer_id) WHERE is_active = true
      DO UPDATE SET access_token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP
    `, [id, accessToken, expiresAt]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const portalLink = `${baseUrl}/portal/${accessToken}`;

    res.json({ accessToken, portalLink, expiresAt });
  }));

  // Access portal with token
  router.get('/portal/:token', authenticate, asyncHandler(async (req, res) => {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT pa.*, c.*
      FROM customer_portal_access pa
      JOIN customers c ON pa.customer_id = c.id
      WHERE pa.access_token = $1 AND pa.is_active = true AND pa.expires_at > NOW()
    `, [token]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Portal access');
    }

    // Update access count
    await pool.query(`
      UPDATE customer_portal_access
      SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1
      WHERE access_token = $1
    `, [token]);

    // Get customer's quotes
    const quotes = await pool.query(`
      SELECT q.*,
             (SELECT COUNT(*) FROM quote_items WHERE quotation_id = q.id) as item_count
      FROM quotations q
      WHERE q.customer_id = $1
      ORDER BY q.created_at DESC
    `, [result.rows[0].customer_id]);

    res.json({ customer: result.rows[0], quotes: quotes.rows });
  }));

  // Submit change request from portal
  router.post('/portal/quotes/:id/change-request', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { customer_id, request_type, description } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_change_requests (quote_id, customer_id, request_type, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, customer_id, request_type, description]);

    res.json(result.rows[0]);
  }));

  // Get change requests for quote
  router.get('/quotes/:id/change-requests', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM quote_change_requests WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 100
    `, [id]);
    res.json(result.rows);
  }));

  // Add comment to quote
  router.post('/quotes/:id/comments', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { comment_text, is_internal, created_by, customer_id } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_comments (quote_id, customer_id, comment_text, is_internal, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, customer_id, comment_text, is_internal || false, created_by]);

    res.json(result.rows[0]);
  }));

  // =====================================================
  // 4. QUOTE TEMPLATES
  // =====================================================

  // Get all templates
  router.get('/quote-templates', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT t.*,
             (SELECT COUNT(*) FROM quote_template_items WHERE template_id = t.id) as item_count
      FROM quote_templates t
      ORDER BY t.name
    `);
    res.json(result.rows);
  }));

  // Get template by ID
  router.get('/quote-templates/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const template = await pool.query(`SELECT * FROM quote_templates WHERE id = $1`, [id]);
    if (template.rows.length === 0) {
      throw ApiError.notFound('Template');
    }

    const items = await pool.query(`
      SELECT ti.*, p.manufacturer, p.model, p.name as product_name, p.cost_cents, p.msrp_cents
      FROM quote_template_items ti
      LEFT JOIN products p ON ti.product_id = p.id
      WHERE ti.template_id = $1
      ORDER BY ti.sort_order
    `, [id]);

    res.json({ ...template.rows[0], items: items.rows });
  }));

  // Create template
  router.post('/quote-templates', authenticate, asyncHandler(async (req, res) => {
    const { name, description, category, template_data, default_terms, default_validity_days, items } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_templates (name, description, category, template_data, default_terms, default_validity_days)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, category, JSON.stringify(template_data || {}), default_terms, default_validity_days || 14]);

    const templateId = result.rows[0].id;

    // Add items if provided
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await pool.query(`
          INSERT INTO quote_template_items (template_id, product_id, product_name, default_quantity, default_discount_percent, sort_order, is_optional, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [templateId, item.product_id, item.product_name, item.quantity || 1, item.discount_percent || 0, i, item.is_optional || false, item.notes]);
      }
    }

    res.json(result.rows[0]);
  }));

  // Create quote from template
  router.post('/quote-templates/:id/create-quote', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { customer_id } = req.body;

    // Get template
    const template = await pool.query(`SELECT * FROM quote_templates WHERE id = $1`, [id]);
    if (template.rows.length === 0) {
      throw ApiError.notFound('Template');
    }

    // Get template items
    const templateItems = await pool.query(`
      SELECT ti.*, p.cost_cents, p.msrp_cents
      FROM quote_template_items ti
      LEFT JOIN products p ON ti.product_id = p.id
      WHERE ti.template_id = $1
    `, [id]);

    // Create quote
    const quote = await pool.query(`
      INSERT INTO quotations (customer_id, status, terms_and_conditions, quote_expiry_date, notes)
      VALUES ($1, 'DRAFT', $2, CURRENT_DATE + $3 * INTERVAL '1 day', $4)
      RETURNING *
    `, [customer_id, template.rows[0].default_terms, template.rows[0].default_validity_days, `Created from template: ${template.rows[0].name}`]);

    // Add items
    for (const item of templateItems.rows) {
      if (!item.is_optional) {
        await pool.query(`
          INSERT INTO quote_items (quotation_id, product_id, quantity, unit_price_cents, line_total_cents)
          VALUES ($1, $2, $3, $4, $5)
        `, [quote.rows[0].id, item.product_id, item.default_quantity, item.cost_cents, item.cost_cents * item.default_quantity]);
      }
    }

    // Increment use count
    await pool.query(`UPDATE quote_templates SET use_count = use_count + 1 WHERE id = $1`, [id]);

    res.json(quote.rows[0]);
  }));

  // =====================================================
  // 5. QUOTE VERSIONING
  // =====================================================

  // Create new version of quote
  router.post('/quotes/:id/create-version', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { version_notes, changed_by } = req.body;

    // Get current quote
    const current = await pool.query(`SELECT * FROM quotations WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      throw ApiError.notFound('Quote');
    }

    const currentQuote = current.rows[0];
    const newVersion = (currentQuote.version || 1) + 1;

    // Save current state to history
    const items = await pool.query(`SELECT * FROM quote_items WHERE quotation_id = $1`, [id]);
    const snapshot = { quote: currentQuote, items: items.rows };

    await pool.query(`
      INSERT INTO quote_version_history (quote_id, version, snapshot_data, changed_by, change_summary)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, currentQuote.version || 1, JSON.stringify(snapshot), changed_by, version_notes]);

    // Update quote version
    await pool.query(`
      UPDATE quotations SET version = $1, version_notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newVersion, version_notes, id]);

    res.json({ success: true, newVersion });
  }));

  // Get version history
  router.get('/quotes/:id/versions', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM quote_version_history
      WHERE quote_id = $1
      ORDER BY version DESC
      LIMIT 100
    `, [id]);
    res.json(result.rows);
  }));

  // =====================================================
  // 6. MOBILE PREVIEW & QR CODES
  // =====================================================

  // Generate public access link
  router.post('/quotes/:id/public-link', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const publicToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await pool.query(`
      UPDATE quotations
      SET public_access_token = $1, public_access_expires = $2
      WHERE id = $3
    `, [publicToken, expiresAt, id]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const publicLink = `${baseUrl}/view/${publicToken}`;

    // Generate QR code data (simple text URL, frontend will render)
    res.json({ publicToken, publicLink, expiresAt });
  }));

  // View quote by public token
  router.get('/public/quotes/:token', authenticate, asyncHandler(async (req, res) => {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT q.*, c.name as customer_name
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.public_access_token = $1 AND q.public_access_expires > NOW()
    `, [token]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Quote');
    }

    // Update view count
    await pool.query(`
      UPDATE quotations
      SET mobile_views = COALESCE(mobile_views, 0) + 1, last_mobile_view = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [result.rows[0].id]);

    // Get items
    const items = await pool.query(`
      SELECT qi.*, p.manufacturer, p.model, p.description
      FROM quote_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [result.rows[0].id]);

    res.json({ quote: result.rows[0], items: items.rows });
  }));

  // =====================================================
  // 7. AUTOMATED FOLLOW-UPS
  // =====================================================

  // Get follow-up rules
  router.get('/follow-up-rules', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`SELECT * FROM quote_follow_up_rules ORDER BY trigger_days LIMIT 100`);
    res.json(result.rows);
  }));

  // Create/update follow-up rule
  router.post('/follow-up-rules', authenticate, asyncHandler(async (req, res) => {
    const { name, description, trigger_days, applies_to_status, is_active } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_follow_up_rules (name, description, trigger_days, applies_to_status, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, trigger_days, applies_to_status || ['SENT'], is_active !== false]);

    res.json(result.rows[0]);
  }));

  // Get pending follow-ups
  router.get('/follow-ups/pending', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT f.*, q.quotation_number, q.customer_id, c.name as customer_name, c.email as customer_email
      FROM quote_follow_ups f
      JOIN quotations q ON f.quote_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE f.status = 'pending' AND f.scheduled_date <= NOW()
      ORDER BY f.scheduled_date
    `);
    res.json(result.rows);
  }));

  // Schedule follow-up for quote
  router.post('/quotes/:id/schedule-followup', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scheduled_date, email_subject, email_body } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_follow_ups (quote_id, scheduled_date, email_subject, email_body)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, scheduled_date, email_subject, email_body]);

    res.json(result.rows[0]);
  }));

  // Mark follow-up as sent
  router.put('/follow-ups/:id/sent', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE quote_follow_ups
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    res.json(result.rows[0]);
  }));

  // =====================================================
  // 8. PAYMENT INTEGRATION
  // =====================================================

  // Get quote payments
  router.get('/quotes/:id/payments', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM quote_payments WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 100
    `, [id]);
    res.json(result.rows);
  }));

  // Record payment (manual or from webhook)
  router.post('/quotes/:id/payments', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { payment_type, amount_cents, payment_method, notes, provider_transaction_id } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_payments (quote_id, payment_type, amount_cents, payment_method, notes, provider_transaction_id, status, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', CURRENT_TIMESTAMP)
      RETURNING *
    `, [id, payment_type, amount_cents, payment_method, notes, provider_transaction_id]);

    res.json(result.rows[0]);
  }));

  // Get payment settings
  router.get('/payment-settings', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT id, provider, is_active, is_test_mode, settings, created_at
      FROM payment_settings
    `);
    res.json(result.rows);
  }));

  // =====================================================
  // 9. PDF ATTACHMENTS
  // =====================================================

  // Get quote attachments
  router.get('/quotes/:id/attachments', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT id, quote_id, product_id, file_name, file_type, file_size, attachment_type, description, include_in_pdf, sort_order, created_at
      FROM quote_attachments WHERE quote_id = $1 ORDER BY sort_order
    `, [id]);
    res.json(result.rows);
  }));

  // Upload attachment
  router.post('/quotes/:id/attachments', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { product_id, attachment_type, description, include_in_pdf } = req.body;

    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    const result = await pool.query(`
      INSERT INTO quote_attachments (quote_id, product_id, file_name, file_type, file_size, file_data, attachment_type, description, include_in_pdf)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, quote_id, file_name, file_type, file_size, attachment_type, description
    `, [id, product_id, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, attachment_type || 'spec_sheet', description, include_in_pdf !== 'false']);

    res.json(result.rows[0]);
  }));

  // Delete attachment
  router.delete('/attachments/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    await pool.query(`DELETE FROM quote_attachments WHERE id = $1`, [id]);
    res.json({ success: true });
  }));

  // Get product spec sheets
  router.get('/products/:id/spec-sheets', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT id, product_id, file_name, file_type, file_size, file_url, language, is_primary, created_at
      FROM product_spec_sheets WHERE product_id = $1 ORDER BY is_primary DESC
    `, [id]);
    res.json(result.rows);
  }));

  // =====================================================
  // 10. PRICE BOOK MANAGEMENT
  // =====================================================

  // Get price books
  router.get('/price-books', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT * FROM price_books ORDER BY effective_date DESC
    `);
    res.json(result.rows);
  }));

  // Create price book
  router.post('/price-books', authenticate, asyncHandler(async (req, res) => {
    const { name, manufacturer, effective_date, expiry_date, notes } = req.body;

    const result = await pool.query(`
      INSERT INTO price_books (name, manufacturer, effective_date, expiry_date, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, manufacturer, effective_date, expiry_date, notes]);

    res.json(result.rows[0]);
  }));

  // Get price change notifications
  router.get('/price-notifications', authenticate, asyncHandler(async (req, res) => {
    const { acknowledged } = req.query;

    let query = `
      SELECT pn.*, p.manufacturer, p.model, p.name as product_name
      FROM price_change_notifications pn
      JOIN products p ON pn.product_id = p.id
      WHERE 1=1
    `;

    if (acknowledged !== undefined) {
      query += ` AND pn.acknowledged = ${acknowledged === 'true'}`;
    }

    query += ` ORDER BY pn.created_at DESC LIMIT 100`;

    const result = await pool.query(query);
    res.json(result.rows);
  }));

  // Acknowledge price notification
  router.put('/price-notifications/:id/acknowledge', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { acknowledged_by } = req.body;

    const result = await pool.query(`
      UPDATE price_change_notifications
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [acknowledged_by, id]);

    res.json(result.rows[0]);
  }));

  // Get scheduled price updates
  router.get('/scheduled-price-updates', authenticate, asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT * FROM scheduled_price_updates ORDER BY manufacturer
    `);
    res.json(result.rows);
  }));

  return router;
};
