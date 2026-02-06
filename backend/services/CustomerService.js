/**
 * Customer Service
 * Handles all customer-related business logic
 */

const LookupService = require('./LookupService');
const { ApiError } = require('../middleware/errorHandler');

class CustomerService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get customers with search, filtering, sorting, and pagination
   * @param {object} options - Query options
   * @returns {Promise<{customers: Array, pagination: object}>}
   */
  async getCustomers(options = {}) {
    const {
      search = '',
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'ASC',
      city = '',
      province = ''
    } = options;

    const cacheKey = `customers:${search}:${page}:${limit}:${sortBy}:${sortOrder}:${city}:${province}`;

    return await this.cache.cacheQuery(cacheKey, 'medium', async () => {
      const offset = (page - 1) * limit;
      const validSortColumns = ['name', 'email', 'company', 'city', 'province', 'created_at'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
      const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      if (search) {
        whereConditions.push(`(
          name ILIKE $${paramIndex} OR
          email ILIKE $${paramIndex} OR
          company ILIKE $${paramIndex} OR
          phone ILIKE $${paramIndex} OR
          city ILIKE $${paramIndex} OR
          province ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      if (city) {
        whereConditions.push(`city ILIKE $${paramIndex}`);
        queryParams.push(`%${city}%`);
        paramIndex++;
      }

      if (province) {
        whereConditions.push(`province ILIKE $${paramIndex}`);
        queryParams.push(`%${province}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM customers ${whereClause}`;
      const countResult = await this.pool.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get paginated results
      const dataQuery = `
        SELECT * FROM customers
        ${whereClause}
        ORDER BY ${sortColumn} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

      return {
        customers: result.rows,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    });
  }

  /**
   * Get customer statistics overview
   * @returns {Promise<object>}
   */
  async getStatsOverview() {
    const stats = await this.pool.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week
      FROM customers
    `);

    const topCustomers = await this.pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.company,
        COUNT(q.id) as quote_count,
        COALESCE(SUM(q.total_amount), 0) as total_spent
      FROM customers c
      LEFT JOIN quotations q ON c.id = q.customer_id
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT 10
    `);

    return {
      overview: stats.rows[0],
      topCustomers: topCustomers.rows
    };
  }

  /**
   * Get customer by ID with quote history
   * @param {number} id - Customer ID
   * @returns {Promise<object|null>}
   */
  async getCustomerById(id) {
    const customerResult = await this.pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );

    if (customerResult.rows.length === 0) {
      return null;
    }

    // Get customer's quotes
    const quotesResult = await this.pool.query(`
      SELECT id, quotation_number, created_at, status, total_amount
      FROM quotations
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    // Get quote statistics
    const statsResult = await this.pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as average_order,
        MAX(created_at) as last_quote_date
      FROM quotations
      WHERE customer_id = $1
    `, [id]);

    return {
      customer: customerResult.rows[0],
      quotes: quotesResult.rows,
      stats: statsResult.rows[0]
    };
  }

  /**
   * Create a new customer
   * @param {object} customerData - Customer data
   * @returns {Promise<object>}
   */
  async createCustomer(customerData) {
    const {
      name, email, phone, company, address, city, province, postal_code, notes,
      marketing_source, marketing_source_detail,
      marketing_source_id, first_contact_date,
      email_transactional, email_marketing, sms_transactional, sms_marketing
    } = customerData;

    const result = await this.pool.query(
      `INSERT INTO customers (
        name, email, phone, company, address, city, province, postal_code, notes,
        marketing_source, marketing_source_detail,
        marketing_source_id, first_contact_date,
        email_transactional, email_marketing, sms_transactional, sms_marketing,
        preferences_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      RETURNING *`,
      [
        name, email, phone, company, address, city, province, postal_code, notes,
        marketing_source || null, marketing_source_detail || null,
        marketing_source_id || null, first_contact_date || null,
        email_transactional ?? true, email_marketing ?? false,
        sms_transactional ?? false, sms_marketing ?? false
      ]
    );

    // Invalidate cache
    this.invalidateCache();

    // Save first and last names for future autocomplete (async, don't block)
    if (name) {
      LookupService.saveNamesFromCustomer(name).catch(err => {
        console.error('[CustomerService] Error saving names:', err.message);
      });
    }

    return result.rows[0];
  }

  /**
   * Update an existing customer
   * @param {number} id - Customer ID
   * @param {object} customerData - Updated customer data
   * @returns {Promise<object|null>}
   */
  async updateCustomer(id, customerData) {
    const {
      name, email, phone, company, address, city, province, postal_code, notes,
      email_transactional, email_marketing, sms_transactional, sms_marketing
    } = customerData;

    // Build SET clause dynamically for optional preference fields
    const hasPrefs = email_transactional !== undefined || email_marketing !== undefined
      || sms_transactional !== undefined || sms_marketing !== undefined;

    const result = await this.pool.query(
      `UPDATE customers SET name = $1, email = $2, phone = $3, company = $4, address = $5,
       city = $6, province = $7, postal_code = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
       ${hasPrefs ? ', email_transactional = COALESCE($11, email_transactional), email_marketing = COALESCE($12, email_marketing), sms_transactional = COALESCE($13, sms_transactional), sms_marketing = COALESCE($14, sms_marketing), preferences_updated_at = NOW()' : ''}
       WHERE id = $10 RETURNING *`,
      hasPrefs
        ? [name, email, phone, company, address, city, province, postal_code, notes, id,
           email_transactional ?? null, email_marketing ?? null, sms_transactional ?? null, sms_marketing ?? null]
        : [name, email, phone, company, address, city, province, postal_code, notes, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Invalidate cache
    this.invalidateCache();

    return result.rows[0];
  }

  /**
   * Delete a customer
   * @param {number} id - Customer ID
   * @returns {Promise<object|null>}
   */
  async deleteCustomer(id) {
    const result = await this.pool.query(
      'DELETE FROM customers WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Invalidate cache
    this.invalidateCache();

    return result.rows[0];
  }

  /**
   * Check if email is already in use
   * @param {string} email - Email to check
   * @param {number} excludeId - Customer ID to exclude (for updates)
   * @returns {Promise<boolean>}
   */
  async isEmailInUse(email, excludeId = null) {
    let query = 'SELECT id FROM customers WHERE email = $1';
    const params = [email];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await this.pool.query(query, params);
    return result.rows.length > 0;
  }

  /**
   * Calculate Customer Lifetime Value (CLV) for a specific customer
   * Based on quote history and order conversion
   * @param {number} customerId - Customer ID
   * @returns {Promise<object>} - CLV metrics
   */
  async calculateLifetimeValue(customerId) {
    // Get all accepted/converted quotes and orders for this customer
    const revenueData = await this.pool.query(`
      WITH quote_revenue AS (
        SELECT
          customer_id,
          COUNT(*) as total_quotes,
          COUNT(CASE WHEN status IN ('accepted', 'converted') THEN 1 END) as converted_quotes,
          COALESCE(SUM(CASE WHEN status IN ('accepted', 'converted') THEN total_amount ELSE 0 END), 0) as quote_revenue,
          MIN(created_at) as first_quote_date,
          MAX(created_at) as last_quote_date
        FROM quotations
        WHERE customer_id = $1
        GROUP BY customer_id
      ),
      order_revenue AS (
        SELECT
          customer_id,
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status NOT IN ('cancelled') THEN 1 END) as completed_orders,
          COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') THEN total_cents ELSE 0 END), 0) as order_revenue_cents,
          MIN(created_at) as first_order_date,
          MAX(created_at) as last_order_date
        FROM orders
        WHERE customer_id = $1
        GROUP BY customer_id
      )
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.created_at as customer_since,
        COALESCE(qr.total_quotes, 0) as total_quotes,
        COALESCE(qr.converted_quotes, 0) as converted_quotes,
        COALESCE(qr.quote_revenue, 0) as quote_revenue,
        COALESCE(qr.first_quote_date, c.created_at) as first_quote_date,
        qr.last_quote_date,
        COALESCE(orv.total_orders, 0) as total_orders,
        COALESCE(orv.completed_orders, 0) as completed_orders,
        COALESCE(orv.order_revenue_cents, 0) as order_revenue_cents,
        orv.first_order_date,
        orv.last_order_date
      FROM customers c
      LEFT JOIN quote_revenue qr ON c.id = qr.customer_id
      LEFT JOIN order_revenue orv ON c.id = orv.customer_id
      WHERE c.id = $1
    `, [customerId]);

    if (revenueData.rows.length === 0) {
      return null;
    }

    const data = revenueData.rows[0];

    // Calculate customer tenure in months
    const customerSince = new Date(data.customer_since);
    const now = new Date();
    const tenureMonths = Math.max(1, Math.floor((now - customerSince) / (1000 * 60 * 60 * 24 * 30)));

    // Calculate total revenue (quotes + orders, avoiding double counting)
    // Order revenue is in cents, quote revenue is in dollars
    const orderRevenue = parseFloat(data.order_revenue_cents) / 100;
    const quoteRevenue = parseFloat(data.quote_revenue);

    // Total lifetime value: use order revenue if available, else quote revenue
    // This avoids double counting since orders are derived from quotes
    const lifetimeValue = orderRevenue > 0 ? orderRevenue : quoteRevenue;

    // Calculate average order value
    const totalTransactions = Math.max(1, parseInt(data.completed_orders) || parseInt(data.converted_quotes) || 1);
    const averageOrderValue = lifetimeValue / totalTransactions;

    // Calculate purchase frequency (transactions per month)
    const purchaseFrequency = totalTransactions / tenureMonths;

    // Calculate conversion rate
    const conversionRate = data.total_quotes > 0
      ? (parseInt(data.converted_quotes) / parseInt(data.total_quotes)) * 100
      : 0;

    // Calculate predicted 12-month value
    const predictedAnnualValue = averageOrderValue * purchaseFrequency * 12;

    // Determine customer segment based on CLV
    let segment;
    if (lifetimeValue >= 50000) {
      segment = 'platinum';
    } else if (lifetimeValue >= 20000) {
      segment = 'gold';
    } else if (lifetimeValue >= 5000) {
      segment = 'silver';
    } else {
      segment = 'bronze';
    }

    // Calculate days since last activity
    const lastActivityDate = data.last_order_date || data.last_quote_date;
    const daysSinceLastActivity = lastActivityDate
      ? Math.floor((now - new Date(lastActivityDate)) / (1000 * 60 * 60 * 24))
      : null;

    // Determine churn risk
    let churnRisk;
    if (daysSinceLastActivity === null) {
      churnRisk = 'unknown';
    } else if (daysSinceLastActivity > 180) {
      churnRisk = 'high';
    } else if (daysSinceLastActivity > 90) {
      churnRisk = 'medium';
    } else {
      churnRisk = 'low';
    }

    return {
      customerId: parseInt(data.customer_id),
      customerName: data.customer_name,
      customerSince: data.customer_since,
      tenureMonths,
      metrics: {
        lifetimeValue: Math.round(lifetimeValue * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        totalTransactions,
        purchaseFrequency: Math.round(purchaseFrequency * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
        predictedAnnualValue: Math.round(predictedAnnualValue * 100) / 100
      },
      quoteStats: {
        totalQuotes: parseInt(data.total_quotes),
        convertedQuotes: parseInt(data.converted_quotes),
        quoteRevenue: parseFloat(data.quote_revenue)
      },
      orderStats: {
        totalOrders: parseInt(data.total_orders),
        completedOrders: parseInt(data.completed_orders),
        orderRevenue: orderRevenue
      },
      segment,
      engagement: {
        lastActivityDate,
        daysSinceLastActivity,
        churnRisk
      }
    };
  }

  /**
   * Get CLV summary for all customers (for analytics dashboard)
   * @param {object} options - Query options
   * @returns {Promise<object>} - CLV summary statistics
   */
  async getLifetimeValueSummary(options = {}) {
    const { limit = 50, segment = null, sortBy = 'lifetime_value', sortOrder = 'DESC' } = options;

    let segmentFilter = '';
    const params = [limit];

    if (segment) {
      const segmentRanges = {
        platinum: 'lifetime_value >= 50000',
        gold: 'lifetime_value >= 20000 AND lifetime_value < 50000',
        silver: 'lifetime_value >= 5000 AND lifetime_value < 20000',
        bronze: 'lifetime_value < 5000'
      };
      if (segmentRanges[segment]) {
        segmentFilter = `HAVING ${segmentRanges[segment]}`;
      }
    }

    const validSortColumns = ['lifetime_value', 'total_transactions', 'average_order_value', 'customer_name'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'lifetime_value';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await this.pool.query(`
      WITH customer_clv AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          c.company,
          c.created_at as customer_since,
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            (SELECT SUM(total_amount) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as lifetime_value,
          COALESCE(
            (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            0
          ) + COALESCE(
            (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as total_transactions,
          GREATEST(
            (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id),
            (SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id)
          ) as last_activity
        FROM customers c
      )
      SELECT
        customer_id,
        customer_name,
        email,
        company,
        customer_since,
        lifetime_value,
        total_transactions,
        CASE WHEN total_transactions > 0 THEN lifetime_value / total_transactions ELSE 0 END as average_order_value,
        last_activity,
        CASE
          WHEN lifetime_value >= 50000 THEN 'platinum'
          WHEN lifetime_value >= 20000 THEN 'gold'
          WHEN lifetime_value >= 5000 THEN 'silver'
          ELSE 'bronze'
        END as segment
      FROM customer_clv
      WHERE lifetime_value > 0
      ${segmentFilter}
      ORDER BY ${sortColumn} ${order}
      LIMIT $1
    `, params);

    // Get aggregate statistics
    const aggregateStats = await this.pool.query(`
      WITH customer_clv AS (
        SELECT
          c.id,
          COALESCE(
            (SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'),
            (SELECT SUM(total_amount) FROM quotations WHERE customer_id = c.id AND status IN ('accepted', 'converted')),
            0
          ) as lifetime_value
        FROM customers c
      )
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN lifetime_value > 0 THEN 1 END) as active_customers,
        COALESCE(SUM(lifetime_value), 0) as total_clv,
        COALESCE(AVG(CASE WHEN lifetime_value > 0 THEN lifetime_value END), 0) as average_clv,
        COUNT(CASE WHEN lifetime_value >= 50000 THEN 1 END) as platinum_count,
        COUNT(CASE WHEN lifetime_value >= 20000 AND lifetime_value < 50000 THEN 1 END) as gold_count,
        COUNT(CASE WHEN lifetime_value >= 5000 AND lifetime_value < 20000 THEN 1 END) as silver_count,
        COUNT(CASE WHEN lifetime_value > 0 AND lifetime_value < 5000 THEN 1 END) as bronze_count
      FROM customer_clv
    `);

    return {
      customers: result.rows.map(row => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        email: row.email,
        company: row.company,
        customerSince: row.customer_since,
        lifetimeValue: parseFloat(row.lifetime_value) || 0,
        totalTransactions: parseInt(row.total_transactions) || 0,
        averageOrderValue: parseFloat(row.average_order_value) || 0,
        lastActivity: row.last_activity,
        segment: row.segment
      })),
      summary: {
        totalCustomers: parseInt(aggregateStats.rows[0].total_customers),
        activeCustomers: parseInt(aggregateStats.rows[0].active_customers),
        totalCLV: parseFloat(aggregateStats.rows[0].total_clv) || 0,
        averageCLV: parseFloat(aggregateStats.rows[0].average_clv) || 0,
        segmentBreakdown: {
          platinum: parseInt(aggregateStats.rows[0].platinum_count),
          gold: parseInt(aggregateStats.rows[0].gold_count),
          silver: parseInt(aggregateStats.rows[0].silver_count),
          bronze: parseInt(aggregateStats.rows[0].bronze_count)
        }
      }
    };
  }

  /**
   * Invalidate customer cache
   */
  invalidateCache() {
    if (this.cache && this.cache.invalidatePattern) {
      this.cache.invalidatePattern('customers:');
    }
  }

  // ============================================
  // CUSTOMER TAGGING METHODS
  // ============================================

  /**
   * Get all available tags
   */
  async getAllTags() {
    const result = await this.pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM customer_tag_assignments WHERE tag_id = t.id) as customer_count
      FROM customer_tags t
      ORDER BY t.is_system DESC, t.name ASC
    `);
    return result.rows;
  }

  /**
   * Create a new tag
   */
  async createTag(tagData, createdBy = null) {
    const { name, color = '#3b82f6', description } = tagData;

    const result = await this.pool.query(`
      INSERT INTO customer_tags (name, color, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, color, description, createdBy]);

    return result.rows[0];
  }

  /**
   * Update a tag
   */
  async updateTag(tagId, updates) {
    const { name, color, description } = updates;

    // Don't allow updating system tags' names
    const tagResult = await this.pool.query(
      'SELECT is_system FROM customer_tags WHERE id = $1',
      [tagId]
    );

    if (tagResult.rows.length === 0) return null;

    if (tagResult.rows[0].is_system && name) {
      throw new Error('Cannot rename system tags');
    }

    const setClauses = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) {
      setClauses.push(`name = $${++paramCount}`);
      values.push(name);
    }
    if (color !== undefined) {
      setClauses.push(`color = $${++paramCount}`);
      values.push(color);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${++paramCount}`);
      values.push(description);
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(tagId);

    const result = await this.pool.query(`
      UPDATE customer_tags
      SET ${setClauses.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Delete a tag (only non-system tags)
   */
  async deleteTag(tagId) {
    const result = await this.pool.query(`
      DELETE FROM customer_tags
      WHERE id = $1 AND is_system = FALSE
      RETURNING id
    `, [tagId]);

    return result.rows.length > 0;
  }

  /**
   * Get tags for a specific customer
   */
  async getCustomerTags(customerId) {
    const result = await this.pool.query(`
      SELECT t.*, cta.assigned_at, u.name as assigned_by_name
      FROM customer_tags t
      JOIN customer_tag_assignments cta ON t.id = cta.tag_id
      LEFT JOIN users u ON cta.assigned_by = u.id
      WHERE cta.customer_id = $1
      ORDER BY t.name
    `, [customerId]);

    return result.rows;
  }

  /**
   * Add tag to customer
   */
  async addTagToCustomer(customerId, tagId, assignedBy = null) {
    try {
      const result = await this.pool.query(`
        INSERT INTO customer_tag_assignments (customer_id, tag_id, assigned_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (customer_id, tag_id) DO NOTHING
        RETURNING *
      `, [customerId, tagId, assignedBy]);

      this.invalidateCache();

      return result.rows[0] || { already_assigned: true };
    } catch (error) {
      if (error.code === '23503') {
        throw new Error('Customer or tag not found');
      }
      throw error;
    }
  }

  /**
   * Remove tag from customer
   */
  async removeTagFromCustomer(customerId, tagId) {
    const result = await this.pool.query(`
      DELETE FROM customer_tag_assignments
      WHERE customer_id = $1 AND tag_id = $2
      RETURNING id
    `, [customerId, tagId]);

    this.invalidateCache();

    return result.rows.length > 0;
  }

  /**
   * Get customers by tag
   */
  async getCustomersByTag(tagId, options = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(`
      SELECT COUNT(*) FROM customer_tag_assignments WHERE tag_id = $1
    `, [tagId]);
    const total = parseInt(countResult.rows[0].count);

    const result = await this.pool.query(`
      SELECT c.*, cta.assigned_at
      FROM customers c
      JOIN customer_tag_assignments cta ON c.id = cta.customer_id
      WHERE cta.tag_id = $1
      ORDER BY c.name
      LIMIT $2 OFFSET $3
    `, [tagId, limit, offset]);

    return {
      customers: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Bulk add tags to multiple customers
   */
  async bulkAddTag(customerIds, tagId, assignedBy = null) {
    const values = customerIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    const params = customerIds.flatMap(id => [id, tagId, assignedBy]);

    await this.pool.query(`
      INSERT INTO customer_tag_assignments (customer_id, tag_id, assigned_by)
      VALUES ${values}
      ON CONFLICT (customer_id, tag_id) DO NOTHING
    `, params);

    this.invalidateCache();

    return { tagged: customerIds.length };
  }

  /**
   * Get tag statistics
   */
  async getTagStats() {
    const result = await this.pool.query(`
      SELECT
        t.id,
        t.name,
        t.color,
        t.is_system,
        COUNT(cta.id) as customer_count,
        COUNT(cta.id) FILTER (WHERE cta.assigned_at >= NOW() - INTERVAL '30 days') as recent_assignments
      FROM customer_tags t
      LEFT JOIN customer_tag_assignments cta ON t.id = cta.tag_id
      GROUP BY t.id
      ORDER BY customer_count DESC
    `);

    return result.rows;
  }

  /**
   * Update auto-assign rules for a tag.
   */
  async updateTagAutoRules(tagId, rules) {
    const result = await this.pool.query(
      'UPDATE customer_tags SET auto_assign_rules = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(rules), tagId]
    );
    return result.rows[0] || null;
  }

  /**
   * Evaluate auto-assign rules and assign tags to matching customers.
   * Returns { tag_id, tag_name, assigned_count } per tag.
   */
  async evaluateAutoTags() {
    const { rows: tags } = await this.pool.query(
      'SELECT id, name, auto_assign_rules FROM customer_tags WHERE auto_assign_rules IS NOT NULL'
    );

    const results = [];

    for (const tag of tags) {
      const rules = tag.auto_assign_rules;
      if (!rules || !Array.isArray(rules.conditions) || rules.conditions.length === 0) continue;

      const conditions = [];
      const params = [];
      let idx = 1;

      for (const c of rules.conditions) {
        const field = this._resolveAutoRuleField(c.field);
        if (!field) continue;

        const op = { gte: '>=', lte: '<=', eq: '=', gt: '>', lt: '<', neq: '!=' }[c.operator];
        if (!op) continue;

        params.push(c.value);
        conditions.push(`${field} ${op} $${idx++}`);
      }

      if (conditions.length === 0) continue;

      const logic = rules.logic === 'OR' ? ' OR ' : ' AND ';
      const tagIdParam = idx;
      params.push(tag.id);

      // Find customers matching rules but not already tagged
      const query = `
        SELECT c.id FROM customers c
        LEFT JOIN (
          SELECT customer_id, COALESCE(SUM(total), 0) AS lifetime_spend, COUNT(*) AS order_count,
                 MAX(created_at) AS last_order_at
          FROM orders WHERE status NOT IN ('cancelled', 'voided')
          GROUP BY customer_id
        ) o ON o.customer_id = c.id
        WHERE (${conditions.join(logic)})
          AND c.id NOT IN (
            SELECT customer_id FROM customer_tag_assignments WHERE tag_id = $${tagIdParam}
          )
      `;

      const { rows: customers } = await this.pool.query(query, params);

      let assigned = 0;
      for (const cust of customers) {
        try {
          await this.pool.query(
            `INSERT INTO customer_tag_assignments (customer_id, tag_id, assigned_by, notes)
             VALUES ($1, $2, NULL, 'Auto-assigned by rule')
             ON CONFLICT (customer_id, tag_id) DO NOTHING`,
            [cust.id, tag.id]
          );
          assigned++;
        } catch {
          // skip individual failures
        }
      }

      results.push({ tag_id: tag.id, tag_name: tag.name, assigned_count: assigned });
    }

    return results;
  }

  /**
   * Map rule field names to SQL expressions.
   */
  _resolveAutoRuleField(field) {
    const map = {
      lifetime_spend: 'COALESCE(o.lifetime_spend, 0)',
      order_count: 'COALESCE(o.order_count, 0)',
      last_order_at: 'o.last_order_at',
      created_at: 'c.created_at',
      customer_type: 'c.customer_type',
      company: 'c.company',
      city: 'c.city',
      province: 'c.province',
    };
    return map[field] || null;
  }
}

module.exports = CustomerService;
