/**
 * CreditMemoService - Credit Memo Lifecycle Management
 *
 * Handles creation, issuance, application, and voiding of credit memos.
 * Supports both amendment-driven (automatic) and manual credit memo creation.
 * All monetary values are stored and calculated in cents (integers).
 */

const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logos', 'teletime-logo-colour-400.png');

// ============================================================================
// Tax Rate Constants (Canadian provinces) — mirrors OrderModificationService
// ============================================================================

const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0 },
  NB: { hst: 0.15, gst: 0, pst: 0 },
  NS: { hst: 0.15, gst: 0, pst: 0 },
  NL: { hst: 0.15, gst: 0, pst: 0 },
  PE: { hst: 0.15, gst: 0, pst: 0 },
  BC: { hst: 0, gst: 0.05, pst: 0.07 },
  SK: { hst: 0, gst: 0.05, pst: 0.06 },
  MB: { hst: 0, gst: 0.05, pst: 0.07 },
  QC: { hst: 0, gst: 0.05, pst: 0.09975 },
  AB: { hst: 0, gst: 0.05, pst: 0 },
  NT: { hst: 0, gst: 0.05, pst: 0 },
  NU: { hst: 0, gst: 0.05, pst: 0 },
  YT: { hst: 0, gst: 0.05, pst: 0 },
};

const VALID_APPLICATION_METHODS = [
  'refund_to_original',
  'store_credit',
  'manual_adjustment',
];

class CreditMemoService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Optional cache module
   * @param {object} config - Configuration options
   */
  constructor(pool, cache = null, config = {}) {
    this.pool = pool;
    this.cache = cache;

    // Company details (same pattern as POSInvoiceService)
    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TeleTime POS';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';

    // SES client for email
    this.sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    this.fromEmail = config.fromEmail || process.env.EMAIL_FROM || 'invoices@teletime.ca';
  }

  // ============================================================================
  // PRIVATE: Tax Calculation
  // ============================================================================

  /**
   * Calculate tax breakdown for a given subtotal and province.
   * QC is compound: PST is calculated on (subtotal + GST).
   * All returned values are Math.round() integers (cents).
   *
   * @param {number} subtotalCents - Taxable amount in cents
   * @param {string} province - Two-letter province code
   * @returns {{ hstCents: number, gstCents: number, pstCents: number, taxTotalCents: number }}
   */
  _calculateTax(subtotalCents, province) {
    const prov = province && TAX_RATES[province] ? province : 'ON';
    const rates = TAX_RATES[prov];

    const hstCents = Math.round(subtotalCents * rates.hst);
    const gstCents = Math.round(subtotalCents * rates.gst);

    // QC compound tax: PST applies to (amount + GST)
    const pstBase = prov === 'QC' ? subtotalCents + gstCents : subtotalCents;
    const pstCents = Math.round(pstBase * rates.pst);

    const taxTotalCents = hstCents + gstCents + pstCents;

    return { hstCents, gstCents, pstCents, taxTotalCents };
  }

  // ============================================================================
  // CREATE FROM AMENDMENT
  // ============================================================================

  /**
   * Create a credit memo automatically from an order amendment.
   * Generates credit lines for items that were removed or had quantity/price reduced.
   *
   * @param {number} amendmentId - ID of the order_amendments record
   * @param {number} userId - ID of the user creating the credit memo
   * @returns {object} The newly created credit memo (via getById)
   */
  async createFromAmendment(amendmentId, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch the amendment
      const amendResult = await client.query(
        'SELECT * FROM order_amendments WHERE id = $1',
        [amendmentId]
      );
      if (amendResult.rows.length === 0) {
        throw new Error('Amendment not found');
      }
      const amendment = amendResult.rows[0];

      // 2. Fetch amendment items
      const itemsResult = await client.query(
        'SELECT * FROM order_amendment_items WHERE amendment_id = $1 ORDER BY id',
        [amendmentId]
      );
      const amendmentItems = itemsResult.rows;

      // 3. Get order details (customer_id, tax_province)
      const orderResult = await client.query(
        'SELECT id, customer_id, tax_province, order_number FROM orders WHERE id = $1',
        [amendment.order_id]
      );
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }
      const order = orderResult.rows[0];
      const province = order.tax_province || 'ON';

      // 4. Build credit lines from amendment items
      const creditLines = [];
      let lineNumber = 0;

      for (const item of amendmentItems) {
        let creditCents = 0;

        if (item.change_type === 'remove') {
          // Full line credit: applied_price * previous_quantity
          creditCents = item.applied_price_cents * item.previous_quantity;
        } else if (item.change_type === 'modify') {
          // Quantity/price reduction credit
          // If price changed: (prev_price * prev_qty) - (new_price * new_qty)
          // If only qty changed: applied_price * (prev_qty - new_qty)
          const prevPriceCents = item.quote_price_cents || item.applied_price_cents;
          const newPriceCents = item.applied_price_cents;
          const prevTotal = prevPriceCents * item.previous_quantity;
          const newTotal = newPriceCents * item.new_quantity;
          creditCents = prevTotal - newTotal;
        } else {
          // 'add' — no credit for additions
          continue;
        }

        // Only include lines where there is an actual credit (positive delta)
        if (creditCents <= 0) continue;

        lineNumber++;
        creditLines.push({
          lineNumber,
          productId: item.product_id,
          productSku: item.product_sku,
          productName: item.product_name,
          quantity: item.change_type === 'remove'
            ? item.previous_quantity
            : item.previous_quantity - item.new_quantity,
          originalUnitPriceCents: item.quote_price_cents || item.applied_price_cents,
          creditedUnitPriceCents: item.applied_price_cents,
          lineTotalCents: creditCents,
          description: item.change_type === 'remove'
            ? 'Item removed from order'
            : `Quantity reduced from ${item.previous_quantity} to ${item.new_quantity}`,
        });
      }

      // If no credit lines, nothing to credit
      if (creditLines.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('No creditable changes found in this amendment');
      }

      // 5. Calculate subtotal and tax
      const subtotalCents = creditLines.reduce((sum, line) => sum + line.lineTotalCents, 0);
      const tax = this._calculateTax(subtotalCents, province);
      const totalCents = subtotalCents + tax.taxTotalCents;

      // 6. Insert credit memo
      const memoResult = await client.query(
        `INSERT INTO credit_memos (
          order_id, amendment_id, customer_id,
          reason, reason_code, internal_notes,
          subtotal_cents, hst_cents, gst_cents, pst_cents, tax_total_cents, total_cents,
          province, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          amendment.order_id,
          amendmentId,
          order.customer_id,
          amendment.reason || 'Credit from order amendment',
          'quantity_change',
          `Auto-generated from amendment ${amendment.amendment_number}`,
          subtotalCents,
          tax.hstCents,
          tax.gstCents,
          tax.pstCents,
          tax.taxTotalCents,
          totalCents,
          province,
          'draft',
          userId,
        ]
      );
      const creditMemoId = memoResult.rows[0].id;

      // 7. Insert credit memo lines
      for (const line of creditLines) {
        // Determine effective tax rate for the line
        const rates = TAX_RATES[province] || TAX_RATES.ON;
        const effectiveTaxRate = rates.hst || (rates.gst + rates.pst);
        const lineTaxCents = Math.round(line.lineTotalCents * effectiveTaxRate);

        await client.query(
          `INSERT INTO credit_memo_lines (
            credit_memo_id, line_number, product_id, product_sku, product_name,
            quantity, original_unit_price_cents, credited_unit_price_cents,
            discount_cents, tax_rate, tax_cents, line_total_cents, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            creditMemoId,
            line.lineNumber,
            line.productId,
            line.productSku,
            line.productName,
            line.quantity,
            line.originalUnitPriceCents,
            line.creditedUnitPriceCents,
            0, // discount_cents
            effectiveTaxRate,
            lineTaxCents,
            line.lineTotalCents,
            line.description,
          ]
        );
      }

      await client.query('COMMIT');

      return this.getById(creditMemoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CREATE MANUAL
  // ============================================================================

  /**
   * Create a credit memo manually (not tied to an amendment).
   *
   * @param {number} orderId - The order to credit against
   * @param {object} params - { lines, reason, reasonCode, internalNotes }
   * @param {number} userId - ID of the user creating the credit memo
   * @returns {object} The newly created credit memo (via getById)
   */
  async createManual(orderId, { lines, reason, reasonCode, internalNotes }, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate reason code if provided
      if (reasonCode) {
        const rcResult = await client.query(
          'SELECT code FROM credit_memo_reason_codes WHERE code = $1 AND active = true',
          [reasonCode]
        );
        if (rcResult.rows.length === 0) {
          throw new Error(`Invalid or inactive reason code: ${reasonCode}`);
        }
      }

      // 2. Get order details
      const orderResult = await client.query(
        'SELECT id, customer_id, tax_province, order_number FROM orders WHERE id = $1',
        [orderId]
      );
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }
      const order = orderResult.rows[0];
      const province = order.tax_province || 'ON';

      // 3. Validate lines
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        throw new Error('At least one credit line is required');
      }

      // 4. Calculate each line total and subtotal
      const processedLines = lines.map((line, idx) => {
        const qty = parseInt(line.quantity, 10);
        const creditedPriceCents = parseInt(line.credited_unit_price_cents || line.creditedUnitPriceCents, 10);
        const originalPriceCents = parseInt(
          line.original_unit_price_cents || line.originalUnitPriceCents || creditedPriceCents,
          10
        );
        const discountCents = parseInt(line.discount_cents || line.discountCents || 0, 10);

        if (!qty || qty <= 0) {
          throw new Error(`Line ${idx + 1}: quantity must be a positive integer`);
        }
        if (!creditedPriceCents || creditedPriceCents <= 0) {
          throw new Error(`Line ${idx + 1}: credited_unit_price_cents must be a positive integer`);
        }

        const lineTotalCents = (creditedPriceCents * qty) - discountCents;

        return {
          lineNumber: idx + 1,
          productId: line.product_id || line.productId || null,
          productSku: line.product_sku || line.productSku || null,
          productName: line.product_name || line.productName || null,
          quantity: qty,
          originalUnitPriceCents: originalPriceCents,
          creditedUnitPriceCents: creditedPriceCents,
          discountCents,
          lineTotalCents,
          description: line.description || null,
        };
      });

      const subtotalCents = processedLines.reduce((sum, l) => sum + l.lineTotalCents, 0);
      const tax = this._calculateTax(subtotalCents, province);
      const totalCents = subtotalCents + tax.taxTotalCents;

      // 5. Insert credit memo
      const memoResult = await client.query(
        `INSERT INTO credit_memos (
          order_id, customer_id,
          reason, reason_code, internal_notes,
          subtotal_cents, hst_cents, gst_cents, pst_cents, tax_total_cents, total_cents,
          province, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          orderId,
          order.customer_id,
          reason || null,
          reasonCode || null,
          internalNotes || null,
          subtotalCents,
          tax.hstCents,
          tax.gstCents,
          tax.pstCents,
          tax.taxTotalCents,
          totalCents,
          province,
          'draft',
          userId,
        ]
      );
      const creditMemoId = memoResult.rows[0].id;

      // 6. Insert credit memo lines
      for (const line of processedLines) {
        const rates = TAX_RATES[province] || TAX_RATES.ON;
        const effectiveTaxRate = rates.hst || (rates.gst + rates.pst);
        const lineTaxCents = Math.round(line.lineTotalCents * effectiveTaxRate);

        await client.query(
          `INSERT INTO credit_memo_lines (
            credit_memo_id, line_number, product_id, product_sku, product_name,
            quantity, original_unit_price_cents, credited_unit_price_cents,
            discount_cents, tax_rate, tax_cents, line_total_cents, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            creditMemoId,
            line.lineNumber,
            line.productId,
            line.productSku,
            line.productName,
            line.quantity,
            line.originalUnitPriceCents,
            line.creditedUnitPriceCents,
            line.discountCents,
            effectiveTaxRate,
            lineTaxCents,
            line.lineTotalCents,
            line.description,
          ]
        );
      }

      await client.query('COMMIT');

      return this.getById(creditMemoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // ISSUE
  // ============================================================================

  /**
   * Issue a draft credit memo: assigns a credit memo number and transitions status.
   *
   * @param {number} creditMemoId - ID of the credit memo to issue
   * @param {number} userId - ID of the user issuing it
   * @returns {object} The updated credit memo (via getById)
   */
  async issue(creditMemoId, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify current status
      const existing = await client.query(
        'SELECT id, status FROM credit_memos WHERE id = $1',
        [creditMemoId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Credit memo not found');
      }
      if (existing.rows[0].status !== 'draft') {
        throw new Error('Credit memo must be in draft status to issue');
      }

      // Generate number and update
      await client.query(
        `UPDATE credit_memos
         SET credit_memo_number = generate_credit_memo_number(),
             status = 'issued',
             issued_at = NOW(),
             issued_by = $2
         WHERE id = $1`,
        [creditMemoId, userId]
      );

      await client.query('COMMIT');

      return this.getById(creditMemoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // APPLY
  // ============================================================================

  /**
   * Apply an issued credit memo using a specified application method.
   *
   * @param {number} creditMemoId - ID of the credit memo to apply
   * @param {string} applicationMethod - One of: refund_to_original, store_credit, manual_adjustment
   * @param {number} userId - ID of the user applying it
   * @returns {object} The updated credit memo (via getById)
   */
  async apply(creditMemoId, applicationMethod, userId) {
    // Validate application method
    if (!VALID_APPLICATION_METHODS.includes(applicationMethod)) {
      throw new Error(
        `Invalid application method: ${applicationMethod}. Must be one of: ${VALID_APPLICATION_METHODS.join(', ')}`
      );
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify current status
      const existing = await client.query(
        'SELECT id, status FROM credit_memos WHERE id = $1',
        [creditMemoId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Credit memo not found');
      }
      if (existing.rows[0].status !== 'issued') {
        throw new Error('Credit memo must be in issued status to apply');
      }

      await client.query(
        `UPDATE credit_memos
         SET status = 'applied',
             applied_at = NOW(),
             applied_by = $2,
             application_method = $3
         WHERE id = $1`,
        [creditMemoId, userId, applicationMethod]
      );

      await client.query('COMMIT');

      return this.getById(creditMemoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // VOID
  // ============================================================================

  /**
   * Void a credit memo. Only issued or applied memos can be voided.
   *
   * @param {number} creditMemoId - ID of the credit memo to void
   * @param {string} reason - Reason for voiding
   * @param {number} userId - ID of the user voiding it
   * @returns {object} The updated credit memo (via getById)
   */
  async void(creditMemoId, reason, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify current status
      const existing = await client.query(
        'SELECT id, status FROM credit_memos WHERE id = $1',
        [creditMemoId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Credit memo not found');
      }
      if (!['issued', 'applied'].includes(existing.rows[0].status)) {
        throw new Error('Credit memo must be in issued or applied status to void');
      }

      await client.query(
        `UPDATE credit_memos
         SET status = 'voided',
             voided_at = NOW(),
             voided_by = $2,
             void_reason = $3
         WHERE id = $1`,
        [creditMemoId, userId, reason]
      );

      await client.query('COMMIT');

      return this.getById(creditMemoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // GET BY ID
  // ============================================================================

  /**
   * Retrieve a single credit memo with all related data.
   *
   * @param {number} id - Credit memo ID
   * @returns {object|null} Credit memo with lines, customer info, and user names
   */
  async getById(id) {
    const memoResult = await this.pool.query(
      `SELECT
        cm.*,
        rc.label AS reason_code_label,
        c.name AS customer_name,
        c.email AS customer_email,
        cu.first_name AS created_first_name,
        cu.last_name AS created_last_name,
        iu.first_name AS issued_first_name,
        iu.last_name AS issued_last_name,
        au.first_name AS applied_first_name,
        au.last_name AS applied_last_name,
        vu.first_name AS voided_first_name,
        vu.last_name AS voided_last_name,
        o.order_number
      FROM credit_memos cm
      LEFT JOIN credit_memo_reason_codes rc ON cm.reason_code = rc.code
      LEFT JOIN customers c ON cm.customer_id = c.id
      LEFT JOIN users cu ON cm.created_by = cu.id
      LEFT JOIN users iu ON cm.issued_by = iu.id
      LEFT JOIN users au ON cm.applied_by = au.id
      LEFT JOIN users vu ON cm.voided_by = vu.id
      LEFT JOIN orders o ON cm.order_id = o.id
      WHERE cm.id = $1`,
      [id]
    );

    if (memoResult.rows.length === 0) return null;

    const row = memoResult.rows[0];

    // Fetch lines
    const linesResult = await this.pool.query(
      `SELECT * FROM credit_memo_lines
       WHERE credit_memo_id = $1
       ORDER BY line_number`,
      [id]
    );

    return {
      id: row.id,
      creditMemoNumber: row.credit_memo_number,
      orderId: row.order_id,
      orderNumber: row.order_number,
      amendmentId: row.amendment_id,
      originalInvoiceNumber: row.original_invoice_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      reason: row.reason,
      reasonCode: row.reason_code,
      reasonCodeLabel: row.reason_code_label,
      internalNotes: row.internal_notes,
      subtotalCents: row.subtotal_cents,
      discountCents: row.discount_cents,
      hstCents: row.hst_cents,
      gstCents: row.gst_cents,
      pstCents: row.pst_cents,
      taxTotalCents: row.tax_total_cents,
      totalCents: row.total_cents,
      province: row.province,
      status: row.status,
      applicationMethod: row.application_method,
      issuedAt: row.issued_at,
      issuedBy: row.issued_by,
      issuedByName: row.issued_first_name
        ? `${row.issued_first_name} ${row.issued_last_name}`
        : null,
      appliedAt: row.applied_at,
      appliedBy: row.applied_by,
      appliedByName: row.applied_first_name
        ? `${row.applied_first_name} ${row.applied_last_name}`
        : null,
      voidedAt: row.voided_at,
      voidedBy: row.voided_by,
      voidedByName: row.voided_first_name
        ? `${row.voided_first_name} ${row.voided_last_name}`
        : null,
      voidReason: row.void_reason,
      pdfUrl: row.pdf_url,
      createdBy: row.created_by,
      createdByName: row.created_first_name
        ? `${row.created_first_name} ${row.created_last_name}`
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lines: linesResult.rows.map((l) => ({
        id: l.id,
        creditMemoId: l.credit_memo_id,
        lineNumber: l.line_number,
        productId: l.product_id,
        productSku: l.product_sku,
        productName: l.product_name,
        quantity: l.quantity,
        originalUnitPriceCents: l.original_unit_price_cents,
        creditedUnitPriceCents: l.credited_unit_price_cents,
        discountCents: l.discount_cents,
        taxRate: parseFloat(l.tax_rate),
        taxCents: l.tax_cents,
        lineTotalCents: l.line_total_cents,
        description: l.description,
      })),
    };
  }

  // ============================================================================
  // LIST BY ORDER
  // ============================================================================

  /**
   * List all credit memos for a given order.
   *
   * @param {number} orderId - The order ID
   * @returns {Array} Array of credit memo summary objects
   */
  async listByOrder(orderId) {
    const result = await this.pool.query(
      `SELECT
        cm.id,
        cm.credit_memo_number,
        cm.order_id,
        cm.amendment_id,
        cm.subtotal_cents,
        cm.tax_total_cents,
        cm.total_cents,
        cm.status,
        cm.application_method,
        cm.reason,
        cm.reason_code,
        cm.created_at,
        cm.issued_at,
        cm.applied_at,
        cm.voided_at,
        c.name AS customer_name,
        c.email AS customer_email
      FROM credit_memos cm
      LEFT JOIN customers c ON cm.customer_id = c.id
      WHERE cm.order_id = $1
      ORDER BY cm.created_at DESC`,
      [orderId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      creditMemoNumber: row.credit_memo_number,
      orderId: row.order_id,
      amendmentId: row.amendment_id,
      subtotalCents: row.subtotal_cents,
      taxTotalCents: row.tax_total_cents,
      totalCents: row.total_cents,
      status: row.status,
      applicationMethod: row.application_method,
      reason: row.reason,
      reasonCode: row.reason_code,
      createdAt: row.created_at,
      issuedAt: row.issued_at,
      appliedAt: row.applied_at,
      voidedAt: row.voided_at,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
    }));
  }

  // ============================================================================
  // LIST ALL (paginated, filtered)
  // ============================================================================

  /**
   * List all credit memos with optional filters and pagination.
   *
   * @param {object} params - { status, customerId, orderId, dateFrom, dateTo, page, limit }
   * @returns {{ data: Array, total: number, page: number, limit: number, totalPages: number }}
   */
  async listAll({ status, customerId, orderId, dateFrom, dateTo, page = 1, limit = 50 } = {}) {
    const conditions = [];
    const params = [];
    let paramIdx = 0;

    if (status) {
      paramIdx++;
      conditions.push(`cm.status = $${paramIdx}`);
      params.push(status);
    }
    if (customerId) {
      paramIdx++;
      conditions.push(`cm.customer_id = $${paramIdx}`);
      params.push(customerId);
    }
    if (orderId) {
      paramIdx++;
      conditions.push(`cm.order_id = $${paramIdx}`);
      params.push(orderId);
    }
    if (dateFrom) {
      paramIdx++;
      conditions.push(`cm.created_at >= $${paramIdx}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      paramIdx++;
      conditions.push(`cm.created_at <= $${paramIdx}`);
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) AS total FROM credit_memos cm ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;
    const totalPages = Math.ceil(total / limitNum);

    // Fetch page
    paramIdx++;
    params.push(limitNum);
    const limitParam = paramIdx;

    paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx;

    const dataResult = await this.pool.query(
      `SELECT
        cm.id,
        cm.credit_memo_number,
        cm.order_id,
        cm.amendment_id,
        cm.customer_id,
        cm.subtotal_cents,
        cm.tax_total_cents,
        cm.total_cents,
        cm.status,
        cm.application_method,
        cm.reason,
        cm.reason_code,
        cm.created_at,
        cm.issued_at,
        cm.applied_at,
        cm.voided_at,
        c.name AS customer_name,
        o.order_number
      FROM credit_memos cm
      LEFT JOIN customers c ON cm.customer_id = c.id
      LEFT JOIN orders o ON cm.order_id = o.id
      ${whereClause}
      ORDER BY cm.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    return {
      data: dataResult.rows.map((row) => ({
        id: row.id,
        creditMemoNumber: row.credit_memo_number,
        orderId: row.order_id,
        orderNumber: row.order_number,
        amendmentId: row.amendment_id,
        customerId: row.customer_id,
        subtotalCents: row.subtotal_cents,
        taxTotalCents: row.tax_total_cents,
        totalCents: row.total_cents,
        status: row.status,
        applicationMethod: row.application_method,
        reason: row.reason,
        reasonCode: row.reason_code,
        createdAt: row.created_at,
        issuedAt: row.issued_at,
        appliedAt: row.applied_at,
        voidedAt: row.voided_at,
        customerName: row.customer_name,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    };
  }

  // ============================================================================
  // PDF GENERATION
  // ============================================================================

  /**
   * Generate a professional PDF for a credit memo.
   * Follows the same enterprise visual style as PdfService and POSInvoiceService.
   *
   * @param {number} creditMemoId - Credit memo ID
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePdf(creditMemoId) {
    const memo = await this.getById(creditMemoId);
    if (!memo) {
      throw new Error(`Credit memo ${creditMemoId} not found`);
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'LETTER',
          bufferPages: true,
        });

        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ============================================
        // ENTERPRISE COLOR SCHEME (matches PdfService)
        // ============================================
        const colors = {
          primary: '#1e40af',
          primaryLight: '#3b82f6',
          text: '#1f2937',
          textSecondary: '#374151',
          textMuted: '#6b7280',
          textLight: '#9ca3af',
          border: '#e5e7eb',
          borderMedium: '#d1d5db',
          background: '#f9fafb',
          bgLight: '#f8fafc',
          bgMuted: '#fafafa',
          white: '#ffffff',
          success: '#10b981',
          error: '#dc2626',
          warning: '#f59e0b',
        };

        // Helpers
        const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
        const fmtDate = (d) =>
          d
            ? new Date(d).toLocaleDateString('en-CA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'N/A';

        // ============================================
        // HEADER — ACCENT BAR, LOGO & COMPANY INFO
        // ============================================
        doc.rect(0, 0, 612, 4).fill(colors.primary);

        // Company Logo (falls back to text name if logo file missing)
        let headerY = 44;
        if (fs.existsSync(LOGO_PATH)) {
          doc.image(LOGO_PATH, 50, 14, { width: 160 });
          headerY = 50;
        } else {
          doc
            .fontSize(22)
            .font('Helvetica-Bold')
            .fillColor(colors.primary)
            .text(this.companyName, 50, 20);
        }

        doc.fontSize(9).font('Helvetica').fillColor(colors.textMuted);
        if (this.companyAddress) {
          doc.text(this.companyAddress, 50, headerY);
          headerY += 11;
        }
        if (this.companyPhone) {
          doc.text(`Tel: ${this.companyPhone}`, 50, headerY);
          headerY += 11;
        }
        if (this.companyEmail) {
          doc.text(this.companyEmail, 50, headerY);
        }

        // CREDIT MEMO BADGE (right side)
        doc
          .roundedRect(400, 12, 162, 78, 4)
          .fillAndStroke(colors.bgLight, colors.border);

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(colors.error)
          .text('CREDIT MEMO', 402, 18, { width: 158, align: 'center' });

        doc
          .fontSize(13)
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(memo.creditMemoNumber || 'DRAFT', 402, 34, {
            width: 158,
            align: 'center',
          });

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(colors.textMuted)
          .text(`Date: ${fmtDate(memo.issuedAt || memo.createdAt)}`, 402, 52, {
            width: 158,
            align: 'center',
          });

        // Status badge inside the card
        const statusColors = {
          draft: { bg: '#f3f4f6', fg: colors.textMuted },
          issued: { bg: '#dbeafe', fg: colors.primary },
          applied: { bg: '#dcfce7', fg: colors.success },
          voided: { bg: '#fee2e2', fg: colors.error },
        };
        const sc = statusColors[memo.status] || statusColors.draft;
        doc.roundedRect(430, 66, 102, 18, 3).fill(sc.bg);
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(sc.fg)
          .text(memo.status.toUpperCase(), 430, 71, {
            width: 102,
            align: 'center',
          });

        // ============================================
        // REFERENCE INFO BOX
        // ============================================
        const refY = 100;
        doc
          .roundedRect(50, refY, 512, 52, 4)
          .fillAndStroke(colors.bgLight, colors.border);

        doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted);

        doc.text('Original Order:', 60, refY + 8);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(memo.orderNumber || 'N/A', 150, refY + 8);

        doc.font('Helvetica').fillColor(colors.textMuted);
        doc.text('Original Invoice:', 300, refY + 8);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(memo.originalInvoiceNumber || 'N/A', 395, refY + 8);

        doc.font('Helvetica').fillColor(colors.textMuted);
        doc.text('Reason:', 60, refY + 24);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text((memo.reason || 'N/A').substring(0, 60), 150, refY + 24, {
            width: 200,
          });

        doc.font('Helvetica').fillColor(colors.textMuted);
        doc.text('Reason Code:', 300, refY + 24);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(memo.reasonCodeLabel || memo.reasonCode || 'N/A', 395, refY + 24);

        if (memo.province) {
          doc.font('Helvetica').fillColor(colors.textMuted);
          doc.text('Province:', 60, refY + 38);
          doc
            .font('Helvetica-Bold')
            .fillColor(colors.text)
            .text(memo.province, 150, refY + 38);
        }

        // ============================================
        // CUSTOMER CARD — BILL TO
        // ============================================
        const custY = 162;
        const custH = 55;
        doc
          .roundedRect(50, custY, 512, custH, 6)
          .fillAndStroke(colors.bgMuted, colors.border);

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(colors.primaryLight)
          .text('BILL TO', 60, custY + 10);

        doc
          .moveTo(60, custY + 22)
          .lineTo(150, custY + 22)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(memo.customerName || 'N/A', 60, custY + 28, { width: 220 });

        // Divider
        doc
          .moveTo(300, custY + 10)
          .lineTo(300, custY + custH - 10)
          .strokeColor(colors.border)
          .stroke();

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(colors.primaryLight)
          .text('CONTACT', 315, custY + 10);

        doc
          .moveTo(315, custY + 22)
          .lineTo(405, custY + 22)
          .strokeColor(colors.border)
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(8).font('Helvetica').fillColor(colors.textLight);
        doc.text('Email:', 315, custY + 28);
        doc
          .fontSize(9)
          .fillColor(memo.customerEmail ? colors.primaryLight : colors.textMuted)
          .text(memo.customerEmail || 'N/A', 355, custY + 28, { width: 200 });

        // ============================================
        // LINE ITEMS TABLE
        // ============================================
        let yPos = custY + custH + 15;
        const tableTop = yPos;

        const cols = {
          line: { x: 50, w: 35 },
          sku: { x: 85, w: 65 },
          desc: { x: 150, w: 145 },
          qty: { x: 295, w: 35 },
          origPrice: { x: 330, w: 65 },
          creditPrice: { x: 395, w: 65 },
          total: { x: 460, w: 102 },
        };

        // Draw table header helper
        const drawTableHeader = (startY) => {
          doc.rect(50, startY, 512, 22).fill(colors.primary);
          doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
          doc.text('LINE', cols.line.x + 3, startY + 7, {
            width: cols.line.w - 6,
            align: 'center',
          });
          doc.text('SKU', cols.sku.x + 3, startY + 7);
          doc.text('DESCRIPTION', cols.desc.x + 3, startY + 7);
          doc.text('QTY', cols.qty.x, startY + 7, {
            width: cols.qty.w,
            align: 'center',
          });
          doc.text('ORIG PRICE', cols.origPrice.x, startY + 7, {
            width: cols.origPrice.w,
            align: 'right',
          });
          doc.text('CREDIT PRICE', cols.creditPrice.x, startY + 7, {
            width: cols.creditPrice.w,
            align: 'right',
          });
          doc.text('LINE TOTAL', cols.total.x, startY + 7, {
            width: cols.total.w,
            align: 'right',
          });
        };

        drawTableHeader(tableTop);
        yPos = tableTop + 22;
        const rowHeight = 28;

        (memo.lines || []).forEach((line, index) => {
          // Page break check
          if (yPos > 680) {
            doc.addPage();
            doc.rect(0, 0, 612, 4).fill(colors.primary);
            drawTableHeader(20);
            yPos = 42;
          }

          // Zebra striping
          if (index % 2 === 0) {
            doc.rect(50, yPos, 512, rowHeight).fill(colors.background);
          }

          // Row border
          doc
            .moveTo(50, yPos + rowHeight)
            .lineTo(562, yPos + rowHeight)
            .strokeColor(colors.border)
            .lineWidth(0.5)
            .stroke();

          const rowTextY = yPos + 8;

          // Line number
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor(colors.textMuted)
            .text(String(line.lineNumber), cols.line.x + 3, rowTextY, {
              width: cols.line.w - 6,
              align: 'center',
            });

          // SKU
          doc
            .fontSize(7)
            .fillColor(colors.textMuted)
            .text((line.productSku || '-').substring(0, 12), cols.sku.x + 3, rowTextY, {
              width: cols.sku.w - 6,
            });

          // Description (product name + description)
          if (line.productName) {
            doc
              .font('Helvetica-Bold')
              .fontSize(8)
              .fillColor(colors.text)
              .text(line.productName.substring(0, 30), cols.desc.x + 3, rowTextY, {
                width: cols.desc.w - 6,
              });
          }
          if (line.description) {
            doc
              .font('Helvetica')
              .fontSize(6)
              .fillColor(colors.textMuted)
              .text(line.description.substring(0, 50), cols.desc.x + 3, rowTextY + 10, {
                width: cols.desc.w - 6,
              });
          }

          // Quantity
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(colors.text)
            .text(String(line.quantity), cols.qty.x, rowTextY, {
              width: cols.qty.w,
              align: 'center',
            });

          // Original Price
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(colors.textSecondary)
            .text(
              fmtMoney(line.originalUnitPriceCents),
              cols.origPrice.x,
              rowTextY,
              { width: cols.origPrice.w, align: 'right' }
            );

          // Credited Price
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(colors.textSecondary)
            .text(
              fmtMoney(line.creditedUnitPriceCents),
              cols.creditPrice.x,
              rowTextY,
              { width: cols.creditPrice.w, align: 'right' }
            );

          // Line Total
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(colors.error)
            .text(fmtMoney(line.lineTotalCents), cols.total.x, rowTextY, {
              width: cols.total.w,
              align: 'right',
            });

          yPos += rowHeight;
        });

        // ============================================
        // TOTALS CARD
        // ============================================
        yPos += 15;

        // Check if we need a new page for totals
        if (yPos > 580) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(colors.primary);
          yPos = 30;
        }

        const totalsBoxX = 350;
        const totalsBoxWidth = 212;

        // Calculate needed height dynamically
        let totalsLines = 1; // subtotal
        if (memo.discountCents && memo.discountCents > 0) totalsLines++;
        if (memo.hstCents && memo.hstCents > 0) totalsLines++;
        if (memo.gstCents && memo.gstCents > 0) totalsLines++;
        if (memo.pstCents && memo.pstCents > 0) totalsLines++;
        // divider + total credit badge
        const totalsBoxHeight = totalsLines * 16 + 70;

        doc
          .roundedRect(totalsBoxX, yPos, totalsBoxWidth, totalsBoxHeight, 4)
          .fillAndStroke(colors.bgMuted, colors.border);

        const labelX = totalsBoxX + 15;
        const valueX = totalsBoxX + totalsBoxWidth - 15;
        let lineY = yPos + 14;

        // Subtotal
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(colors.textMuted)
          .text('Subtotal', labelX, lineY);
        doc
          .fillColor(colors.textSecondary)
          .text(fmtMoney(memo.subtotalCents || 0), valueX - 80, lineY, {
            width: 80,
            align: 'right',
          });

        // Discount
        if (memo.discountCents && memo.discountCents > 0) {
          lineY += 16;
          doc.fillColor(colors.textMuted).text('Discount', labelX, lineY);
          doc
            .fillColor(colors.error)
            .text(`-${fmtMoney(memo.discountCents)}`, valueX - 80, lineY, {
              width: 80,
              align: 'right',
            });
        }

        // HST
        if (memo.hstCents && memo.hstCents > 0) {
          lineY += 16;
          const hstLabel =
            memo.province && TAX_RATES[memo.province] && TAX_RATES[memo.province].hst
              ? `HST (${(TAX_RATES[memo.province].hst * 100).toFixed(0)}%)`
              : 'HST';
          doc.fillColor(colors.textMuted).text(hstLabel, labelX, lineY);
          doc
            .fillColor(colors.textSecondary)
            .text(fmtMoney(memo.hstCents), valueX - 80, lineY, {
              width: 80,
              align: 'right',
            });
        }

        // GST
        if (memo.gstCents && memo.gstCents > 0) {
          lineY += 16;
          doc.fillColor(colors.textMuted).text('GST (5%)', labelX, lineY);
          doc
            .fillColor(colors.textSecondary)
            .text(fmtMoney(memo.gstCents), valueX - 80, lineY, {
              width: 80,
              align: 'right',
            });
        }

        // PST
        if (memo.pstCents && memo.pstCents > 0) {
          lineY += 16;
          doc.fillColor(colors.textMuted).text('PST', labelX, lineY);
          doc
            .fillColor(colors.textSecondary)
            .text(fmtMoney(memo.pstCents), valueX - 80, lineY, {
              width: 80,
              align: 'right',
            });
        }

        // Divider
        lineY += 18;
        doc
          .moveTo(labelX, lineY)
          .lineTo(valueX, lineY)
          .strokeColor(colors.borderMedium)
          .lineWidth(0.5)
          .stroke();

        // TOTAL CREDIT badge
        lineY += 10;
        doc
          .roundedRect(totalsBoxX + 10, lineY, totalsBoxWidth - 20, 28, 3)
          .fill(colors.error);

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('white')
          .text('TOTAL CREDIT', labelX, lineY + 8);

        doc
          .fontSize(13)
          .text(fmtMoney(memo.totalCents || 0), valueX - 85, lineY + 6, {
            width: 80,
            align: 'right',
          });

        // ============================================
        // AUTHORIZATION SECTION
        // ============================================
        const authY = yPos + totalsBoxHeight + 20;
        let authStartY = authY;

        // Check if we need a new page
        if (authStartY > 650) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(colors.primary);
          authStartY = 30;
        }

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text('AUTHORIZATION', 50, authStartY);

        authStartY += 14;
        const authBoxH = memo.applicationMethod ? 70 : 55;
        doc
          .roundedRect(50, authStartY, 280, authBoxH, 4)
          .fillAndStroke(colors.bgLight, colors.border);

        let authLineY = authStartY + 10;

        // Authorized By
        doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted);
        doc.text('Authorized By:', 60, authLineY);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(
            memo.issuedByName || memo.createdByName || 'N/A',
            145,
            authLineY
          );

        // Date
        authLineY += 14;
        doc.font('Helvetica').fillColor(colors.textMuted);
        doc.text('Date:', 60, authLineY);
        doc
          .font('Helvetica-Bold')
          .fillColor(colors.text)
          .text(fmtDate(memo.issuedAt || memo.createdAt), 145, authLineY);

        // Application Method (if applied)
        if (memo.applicationMethod) {
          authLineY += 14;
          const methodLabels = {
            refund_to_original: 'Refund to Original Payment',
            store_credit: 'Store Credit',
            manual_adjustment: 'Manual Adjustment',
          };
          doc.font('Helvetica').fillColor(colors.textMuted);
          doc.text('Application Method:', 60, authLineY);
          doc
            .font('Helvetica-Bold')
            .fillColor(colors.text)
            .text(
              methodLabels[memo.applicationMethod] || memo.applicationMethod,
              165,
              authLineY
            );

          if (memo.appliedAt) {
            authLineY += 14;
            doc.font('Helvetica').fillColor(colors.textMuted);
            doc.text('Applied:', 60, authLineY);
            doc
              .font('Helvetica-Bold')
              .fillColor(colors.text)
              .text(
                `${fmtDate(memo.appliedAt)} by ${memo.appliedByName || 'N/A'}`,
                145,
                authLineY
              );
          }
        }

        // Void info (if voided)
        if (memo.status === 'voided' && memo.voidedAt) {
          const voidBoxY = authStartY;
          doc
            .roundedRect(345, voidBoxY, 217, authBoxH, 4)
            .fillAndStroke('#fee2e2', colors.error);

          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(colors.error)
            .text('VOIDED', 355, voidBoxY + 10);

          doc.fontSize(8).font('Helvetica').fillColor(colors.textSecondary);
          doc.text(`Date: ${fmtDate(memo.voidedAt)}`, 355, voidBoxY + 26);
          doc.text(`By: ${memo.voidedByName || 'N/A'}`, 355, voidBoxY + 40);
          if (memo.voidReason) {
            doc.text(
              `Reason: ${memo.voidReason.substring(0, 40)}`,
              355,
              voidBoxY + 54
            );
          }
        }

        // ============================================
        // FOOTER — ALL PAGES
        // ============================================
        const pageCount = doc.bufferedPageRange().count;

        // Prevent auto-page creation when rendering footer below margin
        const _origAddPage = doc.addPage;
        doc.addPage = function () {
          return this;
        };

        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);

          doc
            .moveTo(50, 745)
            .lineTo(562, 745)
            .strokeColor(colors.border)
            .lineWidth(0.5)
            .stroke();

          // Footer accent line
          doc
            .moveTo(50, 740)
            .lineTo(562, 740)
            .strokeColor(colors.primary)
            .lineWidth(1)
            .stroke();

          // HST number (left)
          const hstNumber = process.env.TELETIME_HST_NUMBER || '';
          if (hstNumber) {
            doc
              .fontSize(7)
              .font('Helvetica')
              .fillColor(colors.textMuted)
              .text(`HST# ${hstNumber}`, 50, 746, { lineBreak: false });
          }

          // Page numbers (right)
          doc
            .fontSize(8)
            .fillColor(colors.textLight)
            .text(`Page ${i + 1} of ${pageCount}`, 450, 746, {
              width: 112,
              align: 'right',
              lineBreak: false,
            });

          // Credit memo notice
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor(colors.textMuted)
            .text(
              `This document is a credit memo issued by ${this.companyName}`,
              50,
              758,
              { width: 512, align: 'center', lineBreak: false }
            );

          // Contact info line
          const contactParts = [
            this.companyWebsite,
            this.companyPhone,
            this.companyEmail,
          ].filter(Boolean);
          if (contactParts.length > 0) {
            doc
              .fontSize(7)
              .fillColor(colors.textLight)
              .text(contactParts.join('  |  '), 50, 770, {
                width: 512,
                align: 'center',
                lineBreak: false,
              });
          }
        }

        // Restore addPage before doc.end()
        doc.addPage = _origAddPage;

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // ============================================================================
  // EMAIL CREDIT MEMO
  // ============================================================================

  /**
   * Email a credit memo PDF to the customer.
   * Follows the same raw MIME / SES pattern as POSInvoiceService.
   *
   * @param {number} creditMemoId - Credit memo ID
   * @returns {{ success: boolean, messageId: string, email: string, creditMemoNumber: string }}
   */
  async emailCreditMemo(creditMemoId) {
    const memo = await this.getById(creditMemoId);
    if (!memo) {
      throw new Error(`Credit memo ${creditMemoId} not found`);
    }
    if (!memo.customerEmail) {
      throw new Error('Customer email address is not available for this credit memo');
    }

    // Generate the PDF
    const pdfBuffer = await this.generatePdf(creditMemoId);

    // Helpers
    const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString('en-CA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'N/A';

    const memoNumber = memo.creditMemoNumber || `CM-${creditMemoId}`;

    // Build HTML email body
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
        <div style="background:#1e40af;height:4px;"></div>
        <div style="max-width:600px;margin:0 auto;padding:0;">
          <div style="background:#fff;padding:30px;">
            <h1 style="margin:0 0 10px;color:#1e40af;font-size:24px;">${this.companyName}</h1>
            <p style="margin:0;color:#6b7280;">Credit Memo ${memoNumber}</p>
            <div style="margin:25px 0;padding:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 5px;font-size:12px;color:#6b7280;">Credit Amount</p>
                    <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626;">${fmtMoney(memo.totalCents || 0)}</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0 0 5px;font-size:12px;color:#6b7280;">Date Issued</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#1f2937;">${fmtDate(memo.issuedAt || memo.createdAt)}</p>
                    ${memo.orderNumber ? `<p style="margin:5px 0 0;font-size:12px;color:#6b7280;">Order: ${memo.orderNumber}</p>` : ''}
                  </td>
                </tr>
              </table>
            </div>
            <p style="color:#374151;line-height:1.6;">Dear ${memo.customerName || 'Valued Customer'},</p>
            <p style="color:#374151;line-height:1.6;">
              Please find attached your credit memo from ${this.companyName}.
              A credit of ${fmtMoney(memo.totalCents || 0)} has been issued${memo.reason ? ` for the following reason: ${memo.reason}` : ''}.
            </p>
            ${memo.applicationMethod
              ? `<p style="color:#374151;line-height:1.6;">
                  This credit will be applied via <strong>${
                    memo.applicationMethod === 'refund_to_original'
                      ? 'refund to your original payment method'
                      : memo.applicationMethod === 'store_credit'
                      ? 'store credit'
                      : 'manual adjustment'
                  }</strong>.
                </p>`
              : ''
            }
            <p style="color:#374151;line-height:1.6;">If you have any questions, please do not hesitate to contact us.</p>
            <p style="color:#374151;line-height:1.6;">Thank you for your business!</p>
          </div>
          <div style="background:#f9fafb;padding:20px 30px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;text-align:center;color:#9ca3af;font-size:12px;">
              ${[this.companyPhone, this.companyEmail].filter(Boolean).join(' | ')}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Build raw MIME email with PDF attachment
    const pdfBase64 = pdfBuffer.toString('base64');
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    const filename = `CreditMemo-${memoNumber}.pdf`;

    const rawEmail = [
      `From: ${this.companyName} <${this.fromEmail}>`,
      `To: ${memo.customerEmail}`,
      `Subject: Credit Memo ${memoNumber} from ${this.companyName}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailHtml,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      pdfBase64,
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const command = new SendEmailCommand({
      FromEmailAddress: this.fromEmail,
      Destination: { ToAddresses: [memo.customerEmail] },
      Content: { Raw: { Data: Buffer.from(rawEmail) } },
    });

    try {
      const result = await this.sesClient.send(command);
      return {
        success: true,
        messageId: result.MessageId,
        email: memo.customerEmail,
        creditMemoNumber: memoNumber,
      };
    } catch (error) {
      console.error('[CreditMemoService] Email error:', error);
      throw new Error(`Failed to send credit memo email: ${error.message}`);
    }
  }
}

module.exports = CreditMemoService;
