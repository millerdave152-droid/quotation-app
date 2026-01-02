/**
 * Quote Service
 * Handles all quotation-related business logic and calculations
 */

class QuoteService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Calculate quote totals from items
   * @param {Array} items - Quote items
   * @param {number} discountPercent - Discount percentage
   * @param {number} taxRate - Tax rate (as decimal like 0.13 or percentage like 13)
   * @returns {object} Calculated totals
   */
  calculateTotals(items, discountPercent = 0, taxRate = 0.13) {
    // Calculate subtotal from items
    const subtotal_cents = items.reduce((sum, item) => {
      const sell_cents = item.sell_cents || Math.round((item.sell || 0) * 100);
      return sum + (sell_cents * (item.quantity || 1));
    }, 0);

    // Calculate discount
    const discount_cents = Math.round((subtotal_cents * discountPercent) / 100);
    const after_discount = subtotal_cents - discount_cents;

    // Normalize tax rate (convert 0.13 to 13 if needed)
    const tax_rate_percent = taxRate < 1 ? taxRate * 100 : taxRate;
    const tax_cents = Math.round((after_discount * tax_rate_percent) / 100);
    const total_cents = after_discount + tax_cents;

    // Calculate cost and profit
    const total_cost_cents = items.reduce((sum, item) => {
      const cost_cents = item.cost_cents || Math.round((item.cost || 0) * 100);
      return sum + (cost_cents * (item.quantity || 1));
    }, 0);

    const gross_profit_cents = after_discount - total_cost_cents;
    const margin_percent = after_discount > 0
      ? Math.round((gross_profit_cents / after_discount) * 10000) / 100
      : 0;

    return {
      subtotal_cents,
      discount_percent: discountPercent,
      discount_cents,
      tax_rate: tax_rate_percent,
      tax_cents,
      total_cents,
      total_cost_cents,
      gross_profit_cents,
      margin_percent
    };
  }

  /**
   * Generate a unique quote number
   * @returns {Promise<string>}
   */
  async generateQuoteNumber() {
    const year = new Date().getFullYear();
    const maxNumResult = await this.pool.query(
      'SELECT quote_number FROM quotations WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1',
      [`QT-${year}-%`]
    );

    let nextNum = 1;
    if (maxNumResult.rows.length > 0) {
      const lastNumber = parseInt(maxNumResult.rows[0].quote_number.split('-').pop());
      nextNum = lastNumber + 1;
    }

    return `QT-${year}-${nextNum.toString().padStart(4, '0')}`;
  }

  /**
   * Get quote statistics summary
   * @returns {Promise<object>}
   */
  async getStatsSummary() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
        COUNT(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 END) as pending_approval_count,

        -- All values in CENTS for frontend compatibility
        COALESCE(SUM(total_cents), 0) as total_value_cents,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents,
        COALESCE(SUM(CASE WHEN status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN total_cents ELSE 0 END), 0) as pipeline_value_cents,
        COALESCE(SUM(CASE WHEN status = 'DRAFT' THEN total_cents ELSE 0 END), 0) as draft_value_cents,
        COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_cents ELSE 0 END), 0) as sent_value_cents,
        COALESCE(SUM(CASE WHEN status = 'LOST' THEN total_cents ELSE 0 END), 0) as lost_value_cents,

        COALESCE(SUM(gross_profit_cents), 0) as total_profit_cents,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN gross_profit_cents ELSE 0 END), 0) as won_profit_cents,

        -- Dollar amounts (for backward compatibility)
        COALESCE(SUM(total_cents), 0) / 100.0 as total_value,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) / 100.0 as won_value,
        COALESCE(SUM(gross_profit_cents), 0) / 100.0 as total_profit,

        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM quotations
    `);

    const stats = result.rows[0];

    // Parse numeric values to ensure proper types
    stats.total_quotes = parseInt(stats.total_quotes) || 0;
    stats.draft_count = parseInt(stats.draft_count) || 0;
    stats.sent_count = parseInt(stats.sent_count) || 0;
    stats.won_count = parseInt(stats.won_count) || 0;
    stats.lost_count = parseInt(stats.lost_count) || 0;
    stats.pending_approval_count = parseInt(stats.pending_approval_count) || 0;

    stats.total_value_cents = parseInt(stats.total_value_cents) || 0;
    stats.won_value_cents = parseInt(stats.won_value_cents) || 0;
    stats.pipeline_value_cents = parseInt(stats.pipeline_value_cents) || 0;
    stats.draft_value_cents = parseInt(stats.draft_value_cents) || 0;
    stats.sent_value_cents = parseInt(stats.sent_value_cents) || 0;
    stats.lost_value_cents = parseInt(stats.lost_value_cents) || 0;
    stats.total_profit_cents = parseInt(stats.total_profit_cents) || 0;
    stats.won_profit_cents = parseInt(stats.won_profit_cents) || 0;

    stats.total_value = parseFloat(stats.total_value) || 0;
    stats.won_value = parseFloat(stats.won_value) || 0;
    stats.total_profit = parseFloat(stats.total_profit) || 0;

    // Calculate win rate
    const total = stats.total_quotes;
    const won = stats.won_count;
    stats.win_rate = total > 0 ? Math.round((won / total) * 100) : 0;

    // Calculate average quote value
    stats.avg_quote_value_cents = total > 0 ? Math.round(stats.total_value_cents / total) : 0;

    return stats;
  }

  /**
   * Get quotes with search, filtering, and pagination
   * @param {object} options - Query options
   * @returns {Promise<{quotations: Array, pagination: object}>}
   */
  async getQuotes(options = {}) {
    const {
      search = '',
      status,
      customer_id,
      from_date,
      to_date,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'quotation_number', 'customer_name', 'total_amount', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        q.quotation_number ILIKE $${paramIndex} OR
        q.quote_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`q.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (customer_id) {
      whereConditions.push(`q.customer_id = $${paramIndex}`);
      queryParams.push(customer_id);
      paramIndex++;
    }

    if (from_date) {
      whereConditions.push(`q.created_at >= $${paramIndex}`);
      queryParams.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereConditions.push(`q.created_at <= $${paramIndex}`);
      queryParams.push(to_date);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await this.pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results
    const dataQuery = `
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company,
        COALESCE(ic.item_count, 0) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN (
        SELECT quotation_id, COUNT(*)::int as item_count
        FROM quotation_items
        GROUP BY quotation_id
      ) ic ON ic.quotation_id = q.id
      WHERE ${whereClause}
      ORDER BY ${sortColumn === 'customer_name' ? 'c.name' : 'q.' + sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      quotations: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Get quote by ID with items and customer info
   * @param {number} id - Quote ID
   * @returns {Promise<object|null>}
   */
  async getQuoteById(id) {
    const quoteResult = await this.pool.query(`
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.company as customer_company
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [id]);

    if (quoteResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await this.pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
      [id]
    );

    const quote = quoteResult.rows[0];
    quote.items = itemsResult.rows;

    return quote;
  }

  /**
   * Create a new quote with items
   * @param {object} quoteData - Quote data including items
   * @returns {Promise<object>}
   */
  async createQuote(quoteData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const {
        customer_id,
        discount_percent = 0,
        tax_rate = 13,
        notes,
        internal_notes = '',
        terms,
        status = 'DRAFT',
        items = [],
        expires_at: providedExpiresAt
      } = quoteData;

      // Calculate totals from items (the source of truth)
      const calculatedTotals = this.calculateTotals(items, discount_percent, tax_rate);
      const {
        subtotal_cents,
        discount_cents,
        tax_cents,
        total_cents,
        gross_profit_cents
      } = calculatedTotals;

      // Generate quote number
      const quote_number = await this.generateQuoteNumber();

      // Set expiration date - use provided date or default to 30 days
      let expires_at;
      if (providedExpiresAt) {
        expires_at = new Date(providedExpiresAt);
        // Validate the date is valid
        if (isNaN(expires_at.getTime())) {
          expires_at = new Date();
          expires_at.setDate(expires_at.getDate() + 30);
        }
      } else {
        expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + 30);
      }

      const quoteResult = await client.query(
        `INSERT INTO quotations (
          quote_number, customer_id, status, subtotal_cents, discount_percent,
          discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
          notes, internal_notes, terms, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          quote_number, customer_id, status, subtotal_cents, discount_percent,
          discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
          notes, internal_notes, terms, expires_at
        ]
      );

      const quotation_id = quoteResult.rows[0].id;

      // Insert items using batch INSERT
      if (items.length > 0) {
        await this.insertQuoteItems(client, quotation_id, items);
      }

      // Log creation event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description)
        VALUES ($1, 'CREATED', 'Quote created')
      `, [quotation_id]);

      await client.query('COMMIT');

      console.log(`✅ Created quotation ${quote_number} with ${items.length} items`);
      return quoteResult.rows[0];

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing quote with items
   * @param {number} id - Quote ID
   * @param {object} quoteData - Updated quote data
   * @returns {Promise<object|null>}
   */
  async updateQuote(id, quoteData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const {
        discount_percent = 0,
        tax_rate = 13,
        notes,
        internal_notes = '',
        terms,
        items = []
      } = quoteData;

      // Calculate totals from items (the source of truth)
      const calculatedTotals = this.calculateTotals(items, discount_percent, tax_rate);
      const {
        subtotal_cents,
        discount_cents,
        tax_cents,
        total_cents,
        gross_profit_cents
      } = calculatedTotals;

      const result = await client.query(
        `UPDATE quotations SET
          subtotal_cents = $1,
          discount_percent = $2,
          discount_cents = $3,
          tax_rate = $4,
          tax_cents = $5,
          total_cents = $6,
          gross_profit_cents = $7,
          notes = $8,
          internal_notes = $9,
          terms = $10,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11 RETURNING *`,
        [
          subtotal_cents, discount_percent, discount_cents, tax_rate, tax_cents,
          total_cents, gross_profit_cents, notes, internal_notes, terms, id
        ]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // Delete old items and insert new ones
      await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);

      if (items.length > 0) {
        await this.insertQuoteItems(client, id, items);
      }

      // Log update event
      await client.query(`
        INSERT INTO quote_events (quotation_id, event_type, description)
        VALUES ($1, 'UPDATED', 'Quote updated')
      `, [id]);

      await client.query('COMMIT');
      return result.rows[0];

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Insert quote items in batch
   * @param {object} client - Database client
   * @param {number} quotationId - Quote ID
   * @param {Array} items - Items to insert
   */
  async insertQuoteItems(client, quotationId, items) {
    const valuesPerRow = 14;
    const placeholders = items.map((_, i) =>
      `(${Array.from({length: valuesPerRow}, (_, j) => `$${i * valuesPerRow + j + 1}`).join(', ')})`
    ).join(', ');

    const values = items.flatMap(item => [
      quotationId,
      item.product_id,
      item.manufacturer || '',
      item.model || item.description,
      item.description,
      item.category || '',
      item.quantity || 1,
      item.cost_cents || Math.round((item.cost || 0) * 100),
      item.msrp_cents || Math.round((item.msrp || 0) * 100),
      item.sell_cents || Math.round((item.sell || 0) * 100),
      item.line_total_cents || Math.round((item.sell || 0) * (item.quantity || 1) * 100),
      item.line_profit_cents || Math.round(((item.sell || 0) - (item.cost || 0)) * (item.quantity || 1) * 100),
      item.margin_bp || 0,
      item.item_notes || item.notes || ''
    ]);

    await client.query(
      `INSERT INTO quotation_items (
        quotation_id, product_id, manufacturer, model, description, category,
        quantity, cost_cents, msrp_cents, sell_cents, line_total_cents,
        line_profit_cents, margin_bp, item_notes
      ) VALUES ${placeholders}`,
      values
    );
  }

  /**
   * Delete a quote and its items
   * @param {number} id - Quote ID
   * @returns {Promise<object|null>}
   */
  async deleteQuote(id) {
    await this.pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    const result = await this.pool.query(
      'DELETE FROM quotations WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Status transition rules
   */
  static STATUS_TRANSITIONS = {
    DRAFT: ['SENT', 'LOST', 'PENDING_APPROVAL'],
    SENT: ['WON', 'LOST', 'DRAFT', 'PENDING_APPROVAL'],
    WON: ['DRAFT'],  // Allow reopening
    LOST: ['DRAFT'], // Allow reopening
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['SENT', 'DRAFT'],
    REJECTED: ['DRAFT']
  };

  /**
   * Validate status transition
   * @param {string} currentStatus - Current quote status
   * @param {string} newStatus - Desired new status
   * @returns {{valid: boolean, reason?: string}}
   */
  validateStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = QuoteService.STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return {
        valid: false,
        reason: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
      };
    }

    return { valid: true };
  }

  /**
   * Update quote status with validation and date tracking
   * @param {number} id - Quote ID
   * @param {string} newStatus - New status
   * @param {object} options - Additional options
   * @param {string} options.lostReason - Reason for losing quote (if status is LOST)
   * @param {boolean} options.skipValidation - Skip transition validation (for admin use)
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, newStatus, options = {}) {
    const validStatuses = ['DRAFT', 'SENT', 'WON', 'LOST', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    // Get current quote to validate transition
    const currentQuote = await this.getQuoteById(id);
    if (!currentQuote) {
      return null;
    }

    const currentStatus = currentQuote.status;

    // Validate transition unless skipped
    if (!options.skipValidation) {
      const validation = this.validateStatusTransition(currentStatus, newStatus);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Additional validation: Can't mark as SENT without a customer
      if (newStatus === 'SENT' && !currentQuote.customer_id) {
        throw new Error('Cannot mark as Sent without a customer assigned');
      }
    }

    // Build the update query with appropriate date fields
    let updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    let values = [newStatus];
    let paramIndex = 2;

    // Set appropriate date based on new status
    if (newStatus === 'SENT' && currentStatus !== 'SENT') {
      updateFields.push(`sent_at = CURRENT_TIMESTAMP`);
    } else if (newStatus === 'WON') {
      updateFields.push(`won_at = CURRENT_TIMESTAMP`);
    } else if (newStatus === 'LOST') {
      updateFields.push(`lost_at = CURRENT_TIMESTAMP`);
      if (options.lostReason) {
        updateFields.push(`lost_reason = $${paramIndex}`);
        values.push(options.lostReason);
        paramIndex++;
      }
    } else if (newStatus === 'DRAFT') {
      // Clear status dates when reopening
      updateFields.push(`won_at = NULL`, `lost_at = NULL`);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE quotations SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length > 0) {
      // Create descriptive event message
      let eventDescription = `Status changed from ${currentStatus} to ${newStatus}`;
      if (newStatus === 'LOST' && options.lostReason) {
        eventDescription += `. Reason: ${options.lostReason}`;
      }

      // Log status change event
      await this.pool.query(`
        INSERT INTO quote_events (quotation_id, event_type, description)
        VALUES ($1, $2, $3)
      `, [id, 'STATUS_CHANGED', eventDescription]);
    }

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get allowed status transitions for a quote
   * @param {string} currentStatus - Current status
   * @returns {string[]} Array of allowed next statuses
   */
  getAllowedTransitions(currentStatus) {
    return QuoteService.STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Get quote events/history
   * @param {number} quoteId - Quote ID
   * @returns {Promise<Array>}
   */
  async getQuoteEvents(quoteId) {
    const result = await this.pool.query(`
      SELECT * FROM quote_events
      WHERE quotation_id = $1
      ORDER BY created_at DESC
    `, [quoteId]);

    return result.rows;
  }

  /**
   * Add event to quote history
   * @param {number} quoteId - Quote ID
   * @param {string} eventType - Event type
   * @param {string} description - Event description
   * @returns {Promise<object>}
   */
  async addQuoteEvent(quoteId, eventType, description) {
    const result = await this.pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3) RETURNING *
    `, [quoteId, eventType, description]);

    return result.rows[0];
  }
}

module.exports = QuoteService;
