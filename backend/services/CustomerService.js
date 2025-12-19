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
   * Invalidate customer cache
   */
  invalidateCache() {
    if (this.cache && this.cache.invalidatePattern) {
      this.cache.invalidatePattern('customers:');
    }
  }
}

module.exports = CustomerService;
