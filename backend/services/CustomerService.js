/**
 * Customer Service
 * Handles all customer-related business logic
 */

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
    const { name, email, phone, company, address, city, province, postal_code, notes } = customerData;

    const result = await this.pool.query(
      `INSERT INTO customers (name, email, phone, company, address, city, province, postal_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, email, phone, company, address, city, province, postal_code, notes]
    );

    // Invalidate cache
    this.invalidateCache();

    return result.rows[0];
  }

  /**
   * Update an existing customer
   * @param {number} id - Customer ID
   * @param {object} customerData - Updated customer data
   * @returns {Promise<object|null>}
   */
  async updateCustomer(id, customerData) {
    const { name, email, phone, company, address, city, province, postal_code, notes } = customerData;

    const result = await this.pool.query(
      `UPDATE customers SET name = $1, email = $2, phone = $3, company = $4, address = $5,
       city = $6, province = $7, postal_code = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [name, email, phone, company, address, city, province, postal_code, notes, id]
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
}

module.exports = CustomerService;
