/**
 * Standardized Quote Routes (v1)
 *
 * Base path: /api/v1/quotes
 *
 * Endpoints:
 *   GET    /                    - List quotes with filtering/pagination
 *   POST   /                    - Create new quote
 *   GET    /:id                 - Get quote by ID
 *   PUT    /:id                 - Update quote
 *   DELETE /:id                 - Delete quote
 *   PATCH  /:id/status          - Update quote status
 *   POST   /:id/clone           - Clone quote
 *   POST   /:id/convert         - Convert quote to order
 *   GET    /:id/items           - Get quote items
 *   POST   /:id/items           - Add item to quote
 *   PUT    /:id/items/:itemId   - Update quote item
 *   DELETE /:id/items/:itemId   - Remove quote item
 *   GET    /:id/events          - Get quote activity log
 *   POST   /:id/send            - Send quote to customer
 *   GET    /stats               - Get quote statistics
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  authenticate,
  requireRole,
  parsePagination,
  parseDateRange,
  normalizeMoneyFields,
  validate,
  validateId
} = require('../../shared/middleware');

const {
  createQuoteSchema,
  updateQuoteSchema,
  quoteStatusUpdateSchema,
  quoteQuerySchema,
  createLineItemSchema,
  updateLineItemSchema
} = require('../../shared/validation/schemas');

const { buildQuoteSnapshot, SnapshotBuildError } = require('../../services/skulytics/SkulyticsSnapshotService');

// Module state - initialized via init()
let pool = null;
let quoteService = null;

// ============================================================================
// LIST QUOTES
// ============================================================================

/**
 * GET /api/v1/quotes
 * List quotes with filtering, pagination, and sorting
 */
router.get('/',
  authenticate,
  validate(quoteQuerySchema, 'query'),
  parsePagination(50, 200),
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { pagination, dateRange, query } = req;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Status filter
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      conditions.push(`UPPER(status) IN (${statuses.map(() => `$${paramIndex++}`).join(', ')})`);
      params.push(...statuses.map(s => s.toUpperCase()));
    }

    // Customer filter
    if (query.customerId) {
      conditions.push(`customer_id = $${paramIndex++}`);
      params.push(query.customerId);
    }

    // Sales rep filter (non-admin only see their own unless filtering)
    if (query.salesRepId) {
      conditions.push(`sales_rep_id = $${paramIndex++}`);
      params.push(query.salesRepId);
    } else if (!['admin', 'manager'].includes(userRole?.toLowerCase())) {
      // Non-managers only see their own quotes
      conditions.push(`(sales_rep_id = $${paramIndex++} OR created_by = $${paramIndex++})`);
      params.push(userId, userId);
    }

    // Date range
    if (dateRange.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(dateRange.startDate);
    }
    if (dateRange.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(dateRange.endDate);
    }

    // Search
    if (query.search) {
      conditions.push(`(
        quotation_number ILIKE $${paramIndex++} OR
        customer_name ILIKE $${paramIndex} OR
        company ILIKE $${paramIndex}
      )`);
      const searchTerm = `%${query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      paramIndex += 2;
    }

    // Requires approval filter
    if (query.requiresApproval !== undefined) {
      conditions.push(`requires_approval = $${paramIndex++}`);
      params.push(query.requiresApproval);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Allowed sort columns
    const sortColumns = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      total: 'total_cents',
      status: 'status',
      customer: 'customer_name',
      number: 'quotation_number'
    };
    const sortBy = sortColumns[pagination.sortBy] || 'created_at';
    const sortOrder = pagination.sortOrder;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated quotes
    const quotesQuery = `
      SELECT
        q.id,
        q.quotation_number,
        q.customer_id,
        c.name as customer_name,
        c.company,
        c.email as customer_email,
        c.phone as customer_phone,
        q.status,
        q.subtotal_cents,
        q.discount_cents,
        q.tax_cents,
        q.total_cents,
        q.sales_rep_name,
        q.sales_rep_id,
        q.notes,
        q.valid_until,
        q.requires_approval,
        q.approval_status,
        q.created_at,
        q.updated_at,
        q.accepted_at
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pagination.limit, pagination.offset);

    const quotesResult = await pool.query(quotesQuery, params);

    // Format response
    const quotes = quotesResult.rows.map(formatQuoteResponse);

    res.paginated(quotes, {
      page: pagination.page,
      limit: pagination.limit,
      total
    });
  })
);

// ============================================================================
// CREATE QUOTE
// ============================================================================

/**
 * POST /api/v1/quotes
 * Create a new quote
 */
router.post('/',
  authenticate,
  normalizeMoneyFields(),
  validate(createQuoteSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const userId = req.user.id;
    const userName = `${req.user.firstName} ${req.user.lastName}`;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get customer details
      const customerResult = await client.query(
        'SELECT id, name, company, email, phone FROM customers WHERE id = $1',
        [data.customerId]
      );

      if (customerResult.rows.length === 0) {
        throw new Error('Customer not found');
      }

      const customer = customerResult.rows[0];

      // Generate quotation number
      const numberResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'Q(\\d+)') AS INTEGER)), 0) + 1 as next_num
        FROM quotations
      `);
      const quotationNumber = `Q${String(numberResult.rows[0].next_num).padStart(6, '0')}`;

      // Calculate totals from items
      let subtotalCents = 0;
      const taxProvince = data.taxProvince || 'ON';

      for (const item of data.items) {
        const itemTotal = (item.unitPriceCents || 0) * item.quantity;
        const discountAmount = item.discountAmountCents || Math.round(itemTotal * (item.discountPercent || 0) / 100);
        subtotalCents += itemTotal - discountAmount;
      }

      // Apply quote-level discount
      const discountCents = data.discountCents || Math.round(subtotalCents * (data.discountPercent || 0) / 100);
      const taxableAmount = subtotalCents - discountCents;

      // Calculate tax based on province
      const taxRates = getTaxRates(taxProvince);
      const taxCents = Math.round(taxableAmount * taxRates.total);
      const totalCents = taxableAmount + taxCents;

      // Check if approval required (margin threshold)
      const requiresApproval = await checkApprovalRequired(client, data.items);

      // Insert quotation
      const quoteResult = await client.query(`
        INSERT INTO quotations (
          quotation_number, customer_id, sales_rep_id, sales_rep_name,
          status, subtotal_cents, discount_cents, tax_cents, total_cents,
          tax_province, notes, internal_notes, valid_until,
          requires_approval, approval_status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        quotationNumber,
        data.customerId,
        data.salesRepId || userId,
        data.salesRepName || userName,
        'DRAFT',
        subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        taxProvince,
        data.notes || null,
        data.internalNotes || null,
        data.validUntil || null,
        requiresApproval,
        requiresApproval ? 'pending' : 'not_required',
        userId
      ]);

      const quote = quoteResult.rows[0];

      // ── Pre-fetch Skulytics data for all items ────────────────
      let skulyticsMap = new Map();
      let skulyticsWarnings = [];
      try {
        const productIds = data.items.filter(i => i.productId).map(i => i.productId);
        if (productIds.length > 0) {
          const { rows: skuProducts } = await client.query(
            `SELECT id, skulytics_id FROM products WHERE id = ANY($1) AND skulytics_id IS NOT NULL`,
            [productIds]
          );
          if (skuProducts.length > 0) {
            const skuIds = skuProducts.map(p => p.skulytics_id);
            const pid2sku = new Map(skuProducts.map(p => [p.id, p.skulytics_id]));
            const { rows: globalRows } = await client.query(
              `SELECT * FROM global_skulytics_products WHERE skulytics_id = ANY($1)`, [skuIds]
            );
            const globalMap = new Map(globalRows.map(g => [g.skulytics_id, g]));
            const tenantId = req.user?.tenant_id || null;
            let overrideMap = new Map();
            if (tenantId) {
              const { rows: ov } = await client.query(
                `SELECT * FROM tenant_product_overrides WHERE tenant_id = $1 AND skulytics_id = ANY($2)`,
                [tenantId, skuIds]
              );
              overrideMap = new Map(ov.map(o => [o.skulytics_id, o]));
            }
            for (const [pid, skuId] of pid2sku) {
              const gp = globalMap.get(skuId);
              if (!gp) continue;
              try {
                const snap = buildQuoteSnapshot(gp, overrideMap.get(skuId) || null);
                skulyticsMap.set(pid, { skulytics_id: skuId, snapshot: snap, is_discontinued: gp.is_discontinued });
                if (gp.is_discontinued) {
                  skulyticsWarnings.push({
                    product_id: pid, skulytics_id: skuId,
                    type: 'DISCONTINUED_PRODUCT',
                    message: 'This product has been discontinued by the manufacturer. Manager acknowledgement required.',
                    requires_acknowledgement: true,
                  });
                }
              } catch (snapErr) {
                if (!(snapErr instanceof SnapshotBuildError)) throw snapErr;
                console.error(`[Skulytics] v1 snapshot failed for ${skuId}:`, snapErr.message);
              }
            }
          }
        }
      } catch (skuErr) {
        console.error('[Skulytics] v1 enrichment failed, continuing:', skuErr.message);
      }

      // Insert items
      for (const item of data.items) {
        const productResult = await client.query(
          'SELECT id, name, model, manufacturer, category, cost_cents, msrp_cents, price FROM products WHERE id = $1',
          [item.productId]
        );

        if (productResult.rows.length === 0) {
          throw new Error(`Product ${item.productId} not found`);
        }

        const product = productResult.rows[0];
        const unitPriceCents = item.unitPriceCents || Math.round(product.price * 100);
        const lineTotalCents = unitPriceCents * item.quantity;
        const discountAmount = item.discountAmountCents || Math.round(lineTotalCents * (item.discountPercent || 0) / 100);
        const finalTotal = lineTotalCents - discountAmount;

        const skuData = skulyticsMap.get(item.productId) || null;

        await client.query(`
          INSERT INTO quotation_items (
            quotation_id, product_id, quantity,
            unit_price, total_price, discount_percent,
            manufacturer, model, description, category,
            cost_cents, msrp_cents, sell_cents, line_total_cents,
            serial_number, item_notes,
            skulytics_id, skulytics_snapshot
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          quote.id,
          item.productId,
          item.quantity,
          unitPriceCents / 100,
          finalTotal / 100,
          item.discountPercent || 0,
          product.manufacturer,
          product.model,
          product.name,
          product.category,
          product.cost_cents || 0,
          product.msrp_cents || 0,
          unitPriceCents,
          finalTotal,
          item.serialNumber || null,
          item.notes || null,
          skuData?.skulytics_id || null,
          skuData?.snapshot ? JSON.stringify(skuData.snapshot) : null,
        ]);
      }

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, event_data, created_by)
        VALUES ($1, 'created', $2, $3)
      `, [quote.id, JSON.stringify({ status: 'DRAFT' }), userId]);

      await client.query('COMMIT');

      // Fetch complete quote with items
      const fullQuote = await getQuoteById(quote.id);

      if (skulyticsWarnings.length > 0) {
        fullQuote.warnings = skulyticsWarnings;
      }

      res.created(fullQuote);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// GET QUOTE BY ID
// ============================================================================

/**
 * GET /api/v1/quotes/:id
 * Get quote with all details
 */
router.get('/:id',
  authenticate,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const quote = await getQuoteById(req.params.id);

    if (!quote) {
      return res.notFound('Quote');
    }

    res.success(quote);
  })
);

// ============================================================================
// UPDATE QUOTE
// ============================================================================

/**
 * PUT /api/v1/quotes/:id
 * Update quote details and items
 */
router.put('/:id',
  authenticate,
  validateId('id'),
  normalizeMoneyFields(),
  validate(updateQuoteSchema),
  asyncHandler(async (req, res) => {
    const quoteId = req.params.id;
    const data = req.body;
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get existing quote
      const existing = await client.query(
        'SELECT * FROM quotations WHERE id = $1 FOR UPDATE',
        [quoteId]
      );

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.notFound('Quote');
      }

      const quote = existing.rows[0];

      // Can only update draft quotes (or if admin)
      if (!['DRAFT', 'draft'].includes(quote.status) && req.user.role !== 'admin') {
        await client.query('ROLLBACK');
        return res.apiError('FORBIDDEN', 'Can only update draft quotes');
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let idx = 1;

      if (data.customerId !== undefined) {
        updates.push(`customer_id = $${idx++}`);
        values.push(data.customerId);
      }
      if (data.salesRepId !== undefined) {
        updates.push(`sales_rep_id = $${idx++}`);
        values.push(data.salesRepId);
      }
      if (data.salesRepName !== undefined) {
        updates.push(`sales_rep_name = $${idx++}`);
        values.push(data.salesRepName);
      }
      if (data.taxProvince !== undefined) {
        updates.push(`tax_province = $${idx++}`);
        values.push(data.taxProvince);
      }
      if (data.notes !== undefined) {
        updates.push(`notes = $${idx++}`);
        values.push(data.notes);
      }
      if (data.internalNotes !== undefined) {
        updates.push(`internal_notes = $${idx++}`);
        values.push(data.internalNotes);
      }
      if (data.validUntil !== undefined) {
        updates.push(`valid_until = $${idx++}`);
        values.push(data.validUntil);
      }

      updates.push(`updated_at = NOW()`);

      if (updates.length > 1) {
        values.push(quoteId);
        await client.query(
          `UPDATE quotations SET ${updates.join(', ')} WHERE id = $${idx}`,
          values
        );
      }

      // Update items if provided
      if (data.items) {
        // ── Preserve existing Skulytics snapshots before delete ──
        const { rows: existingSnapRows } = await client.query(
          `SELECT product_id, skulytics_id, skulytics_snapshot,
                  discontinued_acknowledged_by, discontinued_acknowledged_at
           FROM quotation_items
           WHERE quotation_id = $1 AND skulytics_snapshot IS NOT NULL`,
          [quoteId]
        );
        const preservedSnaps = new Map();
        for (const r of existingSnapRows) {
          preservedSnaps.set(r.product_id, r);
        }

        // Remove existing items
        await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [quoteId]);

        // ── Pre-fetch Skulytics for new items (not already preserved) ──
        let newSkuMap = new Map();
        try {
          const newPids = data.items
            .filter(i => i.productId && !preservedSnaps.has(i.productId))
            .map(i => i.productId);
          if (newPids.length > 0) {
            const { rows: skuProds } = await client.query(
              `SELECT id, skulytics_id FROM products WHERE id = ANY($1) AND skulytics_id IS NOT NULL`,
              [newPids]
            );
            if (skuProds.length > 0) {
              const skuIds = skuProds.map(p => p.skulytics_id);
              const pid2sku = new Map(skuProds.map(p => [p.id, p.skulytics_id]));
              const { rows: gRows } = await client.query(
                `SELECT * FROM global_skulytics_products WHERE skulytics_id = ANY($1)`, [skuIds]
              );
              const gMap = new Map(gRows.map(g => [g.skulytics_id, g]));
              const tid = req.user?.tenant_id || null;
              let ovMap = new Map();
              if (tid) {
                const { rows: ov } = await client.query(
                  `SELECT * FROM tenant_product_overrides WHERE tenant_id = $1 AND skulytics_id = ANY($2)`,
                  [tid, skuIds]
                );
                ovMap = new Map(ov.map(o => [o.skulytics_id, o]));
              }
              for (const [pid, skuId] of pid2sku) {
                const gp = gMap.get(skuId);
                if (!gp) continue;
                try {
                  const snap = buildQuoteSnapshot(gp, ovMap.get(skuId) || null);
                  newSkuMap.set(pid, { skulytics_id: skuId, skulytics_snapshot: JSON.stringify(snap) });
                } catch (e) {
                  if (!(e instanceof SnapshotBuildError)) throw e;
                }
              }
            }
          }
        } catch (err) {
          console.error('[Skulytics] v1 update enrichment failed:', err.message);
        }

        // Merge: preserved snapshots take priority
        const mergedSku = new Map([...newSkuMap, ...preservedSnaps.entries()].map(([k, v]) => [k, {
          skulytics_id: v.skulytics_id || null,
          skulytics_snapshot: v.skulytics_snapshot
            ? (typeof v.skulytics_snapshot === 'string' ? v.skulytics_snapshot : JSON.stringify(v.skulytics_snapshot))
            : null,
          discontinued_acknowledged_by: v.discontinued_acknowledged_by || null,
          discontinued_acknowledged_at: v.discontinued_acknowledged_at || null,
        }]));

        // Insert new items
        let subtotalCents = 0;
        for (const item of data.items) {
          const productResult = await client.query(
            'SELECT * FROM products WHERE id = $1',
            [item.productId]
          );

          if (productResult.rows.length === 0) {
            throw new Error(`Product ${item.productId} not found`);
          }

          const product = productResult.rows[0];
          const unitPriceCents = item.unitPriceCents || Math.round(product.price * 100);
          const lineTotalCents = unitPriceCents * item.quantity;
          const discountAmount = item.discountAmountCents || Math.round(lineTotalCents * (item.discountPercent || 0) / 100);
          const finalTotal = lineTotalCents - discountAmount;
          subtotalCents += finalTotal;

          const skuD = mergedSku.get(item.productId) || null;

          await client.query(`
            INSERT INTO quotation_items (
              quotation_id, product_id, quantity,
              unit_price, total_price, discount_percent,
              manufacturer, model, description, category,
              sell_cents, line_total_cents,
              skulytics_id, skulytics_snapshot,
              discontinued_acknowledged_by, discontinued_acknowledged_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            quoteId,
            item.productId,
            item.quantity,
            unitPriceCents / 100,
            finalTotal / 100,
            item.discountPercent || 0,
            product.manufacturer,
            product.model,
            product.name,
            product.category,
            unitPriceCents,
            finalTotal,
            skuD?.skulytics_id || null,
            skuD?.skulytics_snapshot || null,
            skuD?.discontinued_acknowledged_by || null,
            skuD?.discontinued_acknowledged_at || null,
          ]);
        }

        // Recalculate totals
        const taxProvince = data.taxProvince || quote.tax_province;
        const discountCents = data.discountCents || Math.round(subtotalCents * (data.discountPercent || 0) / 100);
        const taxableAmount = subtotalCents - discountCents;
        const taxRates = getTaxRates(taxProvince);
        const taxCents = Math.round(taxableAmount * taxRates.total);
        const totalCents = taxableAmount + taxCents;

        await client.query(`
          UPDATE quotations SET
            subtotal_cents = $1,
            discount_cents = $2,
            tax_cents = $3,
            total_cents = $4,
            updated_at = NOW()
          WHERE id = $5
        `, [subtotalCents, discountCents, taxCents, totalCents, quoteId]);
      }

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, event_data, created_by)
        VALUES ($1, 'updated', $2, $3)
      `, [quoteId, JSON.stringify({ changes: Object.keys(data) }), userId]);

      await client.query('COMMIT');

      // Fetch updated quote
      const updatedQuote = await getQuoteById(quoteId);
      res.success(updatedQuote);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// DELETE QUOTE
// ============================================================================

/**
 * DELETE /api/v1/quotes/:id
 * Delete a quote (soft delete or hard delete based on status)
 */
router.delete('/:id',
  authenticate,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const quoteId = req.params.id;

    const result = await pool.query(
      'SELECT status FROM quotations WHERE id = $1',
      [quoteId]
    );

    if (result.rows.length === 0) {
      return res.notFound('Quote');
    }

    const quote = result.rows[0];

    // Only allow deletion of draft quotes (unless admin)
    if (!['DRAFT', 'draft'].includes(quote.status) && req.user.role !== 'admin') {
      return res.apiError('FORBIDDEN', 'Can only delete draft quotes');
    }

    await pool.query('DELETE FROM quotations WHERE id = $1', [quoteId]);

    res.success({ deleted: true, id: quoteId });
  })
);

// ============================================================================
// UPDATE QUOTE STATUS
// ============================================================================

/**
 * PATCH /api/v1/quotes/:id/status
 * Update quote status with validation
 */
router.patch('/:id/status',
  authenticate,
  validateId('id'),
  validate(quoteStatusUpdateSchema),
  asyncHandler(async (req, res) => {
    const quoteId = req.params.id;
    const { status, reason, notes } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [quoteId]
    );

    if (result.rows.length === 0) {
      return res.notFound('Quote');
    }

    const quote = result.rows[0];
    const currentStatus = quote.status.toUpperCase();
    const newStatus = status.toUpperCase();

    // Validate status transition
    const allowedTransitions = getStatusTransitions(currentStatus);
    if (!allowedTransitions.includes(newStatus)) {
      return res.apiError('INVALID_STATUS_TRANSITION',
        `Cannot transition from ${currentStatus} to ${newStatus}`,
        { allowedTransitions }
      );
    }

    // Build update
    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [newStatus, quoteId];
    let paramIdx = 3;

    if (newStatus === 'WON' || newStatus === 'APPROVED') {
      updates.push(`accepted_at = NOW()`);
    } else if (newStatus === 'LOST') {
      updates.push(`rejected_at = NOW()`);
    } else if (newStatus === 'EXPIRED') {
      updates.push(`expired_at = NOW()`);
    }

    await pool.query(
      `UPDATE quotations SET ${updates.join(', ')} WHERE id = $2`,
      params
    );

    // Log event
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, event_data, created_by)
      VALUES ($1, 'status_changed', $2, $3)
    `, [
      quoteId,
      JSON.stringify({ from: currentStatus, to: newStatus, reason, notes }),
      userId
    ]);

    const updatedQuote = await getQuoteById(quoteId);
    res.success(updatedQuote);
  })
);

// ============================================================================
// CLONE QUOTE
// ============================================================================

/**
 * POST /api/v1/quotes/:id/clone
 * Clone a quote with all items
 */
router.post('/:id/clone',
  authenticate,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const sourceId = req.params.id;
    const userId = req.user.id;
    const userName = `${req.user.firstName} ${req.user.lastName}`;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get source quote
      const sourceResult = await client.query(
        'SELECT * FROM quotations WHERE id = $1',
        [sourceId]
      );

      if (sourceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.notFound('Quote');
      }

      const source = sourceResult.rows[0];

      // Generate new number
      const numberResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'Q(\\d+)') AS INTEGER)), 0) + 1 as next_num
        FROM quotations
      `);
      const quotationNumber = `Q${String(numberResult.rows[0].next_num).padStart(6, '0')}`;

      // Create clone
      const cloneResult = await client.query(`
        INSERT INTO quotations (
          quotation_number, customer_id, sales_rep_id, sales_rep_name,
          status, subtotal_cents, discount_cents, tax_cents, total_cents,
          tax_province, notes, internal_notes, requires_approval, approval_status, created_by
        ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        quotationNumber,
        source.customer_id,
        userId,
        userName,
        source.subtotal_cents,
        source.discount_cents,
        source.tax_cents,
        source.total_cents,
        source.tax_province,
        source.notes ? `Cloned from ${source.quotation_number}: ${source.notes}` : `Cloned from ${source.quotation_number}`,
        source.internal_notes,
        source.requires_approval,
        source.requires_approval ? 'pending' : 'not_required',
        userId
      ]);

      const cloneId = cloneResult.rows[0].id;

      // Clone items
      await client.query(`
        INSERT INTO quotation_items (
          quotation_id, product_id, quantity, unit_price, total_price, discount_percent,
          manufacturer, model, description, category, cost_cents, msrp_cents, sell_cents, line_total_cents
        )
        SELECT $1, product_id, quantity, unit_price, total_price, discount_percent,
               manufacturer, model, description, category, cost_cents, msrp_cents, sell_cents, line_total_cents
        FROM quotation_items WHERE quotation_id = $2
      `, [cloneId, sourceId]);

      // Log event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, event_data, created_by)
        VALUES ($1, 'cloned', $2, $3)
      `, [cloneId, JSON.stringify({ sourceId, sourceNumber: source.quotation_number }), userId]);

      await client.query('COMMIT');

      const clonedQuote = await getQuoteById(cloneId);
      res.created(clonedQuote);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// CONVERT QUOTE TO ORDER
// ============================================================================

/**
 * POST /api/v1/quotes/:id/convert
 * Convert accepted quote to order
 */
router.post('/:id/convert',
  authenticate,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const quoteId = req.params.id;
    const userId = req.user.id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get quote with FOR UPDATE lock
      const quoteResult = await client.query(
        'SELECT * FROM quotations WHERE id = $1 FOR UPDATE',
        [quoteId]
      );

      if (quoteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.notFound('Quote');
      }

      const quote = quoteResult.rows[0];

      // Verify status allows conversion
      if (!['WON', 'APPROVED', 'accepted'].includes(quote.status.toLowerCase())) {
        await client.query('ROLLBACK');
        return res.apiError('BAD_REQUEST', 'Quote must be accepted/won to convert to order');
      }

      // Generate order number
      const orderNumberResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'ORD-(\\d+)') AS INTEGER)), 0) + 1 as next_num
        FROM orders
      `);
      const orderNumber = `ORD-${String(orderNumberResult.rows[0].next_num).padStart(6, '0')}`;

      // Create order
      const orderResult = await client.query(`
        INSERT INTO orders (
          order_number, source, source_id, source_reference,
          customer_id, status, payment_status, delivery_status,
          subtotal_cents, discount_cents, tax_cents, total_cents,
          tax_province, sales_rep_id, notes, created_by
        ) VALUES ($1, 'quote', $2, $3, $4, 'order_confirmed', 'unpaid', 'pending', $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        orderNumber,
        quote.id,
        quote.quotation_number,
        quote.customer_id,
        quote.subtotal_cents,
        quote.discount_cents,
        quote.tax_cents,
        quote.total_cents,
        quote.tax_province,
        quote.sales_rep_id,
        quote.notes,
        userId
      ]);

      const orderId = orderResult.rows[0].id;

      // Copy items to order
      await client.query(`
        INSERT INTO order_items (
          order_id, product_id, product_name, product_sku,
          quantity, unit_price_cents, discount_percent, discount_amount_cents,
          line_total_cents, taxable
        )
        SELECT $1, qi.product_id, qi.description, qi.model,
               qi.quantity, qi.sell_cents, qi.discount_percent, 0,
               qi.line_total_cents, true
        FROM quotation_items qi WHERE qi.quotation_id = $2
      `, [orderId, quoteId]);

      // Update quote status
      await client.query(`
        UPDATE quotations SET status = 'CONVERTED', converted_to_order_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [orderId, quoteId]);

      // Log events
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, event_data, created_by)
        VALUES ($1, 'converted_to_order', $2, $3)
      `, [quoteId, JSON.stringify({ orderId, orderNumber }), userId]);

      await client.query('COMMIT');

      res.success({
        quote: await getQuoteById(quoteId),
        order: {
          id: orderId,
          orderNumber
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================================
// GET QUOTE STATISTICS
// ============================================================================

/**
 * GET /api/v1/quotes/stats
 * Get quote statistics and metrics
 */
router.get('/stats',
  authenticate,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { dateRange } = req;

    let dateCondition = '';
    const params = [];

    if (dateRange.startDate) {
      params.push(dateRange.startDate);
      dateCondition += ` AND created_at >= $${params.length}`;
    }
    if (dateRange.endDate) {
      params.push(dateRange.endDate);
      dateCondition += ` AND created_at <= $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE UPPER(status) IN ('DRAFT', 'SENT')) as pending_quotes,
        COUNT(*) FILTER (WHERE UPPER(status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED')) as won_quotes,
        COUNT(*) FILTER (WHERE UPPER(status) = 'LOST') as lost_quotes,
        COUNT(*) FILTER (WHERE UPPER(status) = 'EXPIRED') as expired_quotes,
        COALESCE(SUM(total_cents) FILTER (WHERE UPPER(status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED')), 0) as won_value_cents,
        COALESCE(AVG(total_cents) FILTER (WHERE UPPER(status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED')), 0) as avg_won_value_cents,
        COALESCE(AVG(total_cents), 0) as avg_quote_value_cents
      FROM quotations
      WHERE 1=1 ${dateCondition}
    `, params);

    const stats = result.rows[0];
    const totalDecided = parseInt(stats.won_quotes) + parseInt(stats.lost_quotes);
    const conversionRate = totalDecided > 0
      ? (parseInt(stats.won_quotes) / totalDecided * 100).toFixed(1)
      : 0;

    res.success({
      totalQuotes: parseInt(stats.total_quotes),
      pendingQuotes: parseInt(stats.pending_quotes),
      wonQuotes: parseInt(stats.won_quotes),
      lostQuotes: parseInt(stats.lost_quotes),
      expiredQuotes: parseInt(stats.expired_quotes),
      conversionRate: parseFloat(conversionRate),
      wonValueCents: parseInt(stats.won_value_cents),
      avgWonValueCents: Math.round(parseFloat(stats.avg_won_value_cents)),
      avgQuoteValueCents: Math.round(parseFloat(stats.avg_quote_value_cents))
    });
  })
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get quote by ID with all related data
 */
async function getQuoteById(id) {
  const quoteResult = await pool.query(`
    SELECT
      q.*,
      c.name as customer_name,
      c.company as customer_company,
      c.email as customer_email,
      c.phone as customer_phone
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.id = $1
  `, [id]);

  if (quoteResult.rows.length === 0) {
    return null;
  }

  const quote = quoteResult.rows[0];

  // Get items
  const itemsResult = await pool.query(`
    SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id
  `, [id]);

  return formatQuoteResponse(quote, itemsResult.rows);
}

/**
 * Format quote for API response
 */
function formatQuoteResponse(quote, items = []) {
  return {
    id: quote.id,
    quotationNumber: quote.quotation_number,
    status: quote.status,
    customer: {
      id: quote.customer_id,
      name: quote.customer_name,
      company: quote.customer_company || quote.company,
      email: quote.customer_email,
      phone: quote.customer_phone
    },
    salesRep: {
      id: quote.sales_rep_id,
      name: quote.sales_rep_name
    },
    items: items.map(item => ({
      id: item.id,
      productId: item.product_id,
      productName: item.description || item.model,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
      quantity: item.quantity,
      unitPriceCents: item.sell_cents || Math.round(item.unit_price * 100),
      discountPercent: parseFloat(item.discount_percent) || 0,
      lineTotalCents: item.line_total_cents || Math.round(item.total_price * 100),
      serialNumber: item.serial_number,
      notes: item.item_notes
    })),
    subtotalCents: quote.subtotal_cents,
    discountCents: quote.discount_cents,
    taxCents: quote.tax_cents,
    totalCents: quote.total_cents,
    taxProvince: quote.tax_province,
    notes: quote.notes,
    internalNotes: quote.internal_notes,
    validUntil: quote.valid_until,
    requiresApproval: quote.requires_approval,
    approvalStatus: quote.approval_status,
    acceptedAt: quote.accepted_at,
    rejectedAt: quote.rejected_at,
    expiredAt: quote.expired_at,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at
  };
}

/**
 * Get tax rates for province
 */
function getTaxRates(province) {
  const rates = {
    ON: { hst: 0.13, gst: 0, pst: 0, total: 0.13 },
    BC: { hst: 0, gst: 0.05, pst: 0.07, total: 0.12 },
    AB: { hst: 0, gst: 0.05, pst: 0, total: 0.05 },
    SK: { hst: 0, gst: 0.05, pst: 0.06, total: 0.11 },
    MB: { hst: 0, gst: 0.05, pst: 0.07, total: 0.12 },
    QC: { hst: 0, gst: 0.05, pst: 0.09975, total: 0.14975 },
    NB: { hst: 0.15, gst: 0, pst: 0, total: 0.15 },
    NS: { hst: 0.15, gst: 0, pst: 0, total: 0.15 },
    PE: { hst: 0.15, gst: 0, pst: 0, total: 0.15 },
    NL: { hst: 0.15, gst: 0, pst: 0, total: 0.15 },
    YT: { hst: 0, gst: 0.05, pst: 0, total: 0.05 },
    NT: { hst: 0, gst: 0.05, pst: 0, total: 0.05 },
    NU: { hst: 0, gst: 0.05, pst: 0, total: 0.05 }
  };
  return rates[province] || rates.ON;
}

/**
 * Get allowed status transitions
 */
function getStatusTransitions(currentStatus) {
  const transitions = {
    DRAFT: ['SENT', 'PENDING_APPROVAL'],
    SENT: ['PENDING_APPROVAL', 'WON', 'LOST', 'EXPIRED'],
    PENDING_APPROVAL: ['APPROVED', 'SENT'],
    APPROVED: ['WON', 'LOST', 'EXPIRED'],
    WON: ['CONVERTED'],
    LOST: [],
    EXPIRED: [],
    CONVERTED: []
  };
  return transitions[currentStatus] || [];
}

/**
 * Check if approval is required based on margin thresholds
 */
async function checkApprovalRequired(client, items) {
  // Simple margin check - in real implementation, this would check business rules
  // For now, return false (no approval required)
  return false;
}

// ============================================================================
// MODULE INITIALIZATION
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  quoteService = deps.quoteService;
  return router;
};

module.exports = { router, init };
