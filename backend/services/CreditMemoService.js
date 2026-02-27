/**
 * CreditMemoService - Credit Memo Lifecycle Management
 *
 * Handles creation, issuance, application, and voiding of credit memos.
 * Supports both amendment-driven (automatic) and manual credit memo creation.
 * All monetary values are stored and calculated in cents (integers).
 */

const { SESv2Client } = require('@aws-sdk/client-sesv2');

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
         SET credit_memo_number = 'CM-' || LPAD(nextval('credit_memo_number_seq')::text, 6, '0'),
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
  // PDF GENERATION (STUB — Task 3)
  // ============================================================================

  /**
   * Generate a PDF for a credit memo.
   * Stub implementation — will be completed in Task 3.
   *
   * @param {number} creditMemoId - Credit memo ID
   * @returns {Buffer} PDF buffer
   */
  async generatePdf(creditMemoId) {
    // Stub: return placeholder buffer
    return Buffer.from('PDF placeholder');
  }

  // ============================================================================
  // EMAIL CREDIT MEMO (STUB — Task 3)
  // ============================================================================

  /**
   * Email a credit memo PDF to the customer.
   * Stub implementation — will be completed in Task 3.
   *
   * @param {number} creditMemoId - Credit memo ID
   */
  async emailCreditMemo(creditMemoId) {
    throw new Error('Not implemented yet');
  }
}

module.exports = CreditMemoService;
