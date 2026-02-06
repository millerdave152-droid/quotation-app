/**
 * TeleTime POS - Sales Rep Service
 * Handles fetching active/on-shift sales representatives
 */

class SalesRepService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get initials from a name
   * @param {string} firstName
   * @param {string} lastName
   * @returns {string} Initials (e.g., "AV")
   */
  getInitials(firstName, lastName) {
    const first = (firstName || '').charAt(0).toUpperCase();
    const last = (lastName || '').charAt(0).toUpperCase();
    return `${first}${last}` || '?';
  }

  /**
   * Get active/on-shift sales reps
   * Uses shift management if shifts exist, otherwise returns all active sales users
   *
   * @param {object} options
   * @param {number} options.currentUserId - The logged-in user's ID
   * @param {number} options.limit - Max reps to return (default: 15)
   * @param {boolean} options.includeStats - Include sales stats (default: true)
   * @returns {Promise<object>} { reps: [], defaultRepId: number|null, source: string }
   */
  async getActiveSalesReps({ currentUserId, limit = 15, includeStats = true } = {}) {
    // First, check if there are any open shifts
    const shiftsResult = await this.pool.query(`
      SELECT COUNT(*) as count FROM register_shifts WHERE status = 'open'
    `);

    const hasOpenShifts = parseInt(shiftsResult.rows[0].count, 10) > 0;

    let reps = [];
    let source = 'all_active';

    if (hasOpenShifts) {
      // Option A: Shift management exists - get reps on open shifts
      reps = await this.getRepsOnShift({ limit, includeStats });
      source = 'shifts';
    } else {
      // Option B: No shift management - get all active sales reps
      reps = await this.getAllActiveSalesReps({ limit, includeStats });
      source = 'all_active';
    }

    // Determine default rep (current user if they're a sales rep)
    let defaultRepId = null;
    if (currentUserId) {
      const isCurrentUserSalesRep = reps.some(rep => rep.id === currentUserId);
      if (isCurrentUserSalesRep) {
        defaultRepId = currentUserId;
      } else {
        // Check if current user is a sales rep but not in the list
        const currentUserResult = await this.pool.query(`
          SELECT id, role FROM users
          WHERE id = $1 AND is_active = true
        `, [currentUserId]);

        if (currentUserResult.rows.length > 0) {
          const userRole = (currentUserResult.rows[0].role || '').toLowerCase();
          if (['sales', 'cashier', 'admin', 'manager'].includes(userRole)) {
            defaultRepId = currentUserId;
          }
        }
      }
    }

    return {
      reps,
      defaultRepId,
      source,
      count: reps.length,
    };
  }

  /**
   * Get sales reps currently on open shifts
   * @private
   */
  async getRepsOnShift({ limit = 15, includeStats = true } = {}) {
    const today = new Date().toISOString().split('T')[0];

    let query = `
      SELECT DISTINCT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.department,
        NULL as avatar_url,
        rs.shift_id,
        rs.opened_at as shift_start,
        r.register_name
    `;

    if (includeStats) {
      query += `,
        COALESCE(stats.sales_today, 0) as sales_today,
        COALESCE(stats.revenue_today, 0) as revenue_today
      `;
    }

    query += `
      FROM register_shifts rs
      JOIN users u ON rs.user_id = u.id
      JOIN registers r ON rs.register_id = r.register_id
    `;

    if (includeStats) {
      query += `
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT t.transaction_id) as sales_today,
            COALESCE(SUM(t.total_amount), 0) as revenue_today
          FROM transactions t
          WHERE t.salesperson_id = u.id
            AND t.status = 'completed'
            AND DATE(t.created_at) = $1
        ) stats ON true
      `;
    }

    query += `
      WHERE rs.status = 'open'
        AND u.is_active = true
      ORDER BY u.first_name, u.last_name
      LIMIT $${includeStats ? 2 : 1}
    `;

    const params = includeStats ? [today, limit] : [limit];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.formatRep(row, true));
  }

  /**
   * Get all active sales reps (when no shifts are open)
   * @private
   */
  async getAllActiveSalesReps({ limit = 15, includeStats = true } = {}) {
    const today = new Date().toISOString().split('T')[0];

    let query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.department,
        NULL as avatar_url
    `;

    if (includeStats) {
      query += `,
        COALESCE(stats.sales_today, 0) as sales_today,
        COALESCE(stats.revenue_today, 0) as revenue_today
      `;
    }

    query += `
      FROM users u
    `;

    if (includeStats) {
      query += `
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT t.transaction_id) as sales_today,
            COALESCE(SUM(t.total_amount), 0) as revenue_today
          FROM transactions t
          WHERE t.salesperson_id = u.id
            AND t.status = 'completed'
            AND DATE(t.created_at) = $1
        ) stats ON true
      `;
    }

    query += `
      WHERE u.is_active = true
        AND u.role IN ('sales', 'cashier', 'admin', 'manager', 'user')
      ORDER BY
        CASE u.role
          WHEN 'sales' THEN 1
          WHEN 'cashier' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'admin' THEN 4
          ELSE 5
        END,
        u.first_name, u.last_name
      LIMIT $${includeStats ? 2 : 1}
    `;

    const params = includeStats ? [today, limit] : [limit];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.formatRep(row, false));
  }

  /**
   * Search all sales reps by name or email
   * @param {object} options
   * @param {string} options.search - Search query
   * @param {number} options.limit - Max results (default: 50)
   * @returns {Promise<Array>} Array of rep objects
   */
  async searchSalesReps({ search = '', limit = 50 } = {}) {
    const today = new Date().toISOString().split('T')[0];

    let query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.department,
        NULL as avatar_url,
        COALESCE(stats.sales_today, 0) as sales_today,
        COALESCE(stats.revenue_today, 0) as revenue_today,
        EXISTS(
          SELECT 1 FROM register_shifts rs
          WHERE rs.user_id = u.id AND rs.status = 'open'
        ) as is_on_shift,
        (
          SELECT rs.opened_at FROM register_shifts rs
          WHERE rs.user_id = u.id AND rs.status = 'open'
          LIMIT 1
        ) as shift_start
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT t.transaction_id) as sales_today,
          COALESCE(SUM(t.total_amount), 0) as revenue_today
        FROM transactions t
        WHERE t.salesperson_id = u.id
          AND t.status = 'completed'
          AND DATE(t.created_at) = $1
      ) stats ON true
      WHERE u.is_active = true
    `;

    const params = [today];

    if (search) {
      query += `
        AND (
          u.first_name ILIKE $2 OR
          u.last_name ILIKE $2 OR
          (u.first_name || ' ' || u.last_name) ILIKE $2 OR
          u.email ILIKE $2
        )
      `;
      params.push(`%${search}%`);
    }

    query += `
      ORDER BY
        CASE WHEN EXISTS(
          SELECT 1 FROM register_shifts rs
          WHERE rs.user_id = u.id AND rs.status = 'open'
        ) THEN 0 ELSE 1 END,
        u.first_name, u.last_name
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.formatRep(row, row.is_on_shift));
  }

  /**
   * Get a single sales rep by ID
   * @param {number} repId
   * @returns {Promise<object|null>}
   */
  async getSalesRepById(repId) {
    const today = new Date().toISOString().split('T')[0];

    const result = await this.pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.department,
        NULL as avatar_url,
        COALESCE(stats.sales_today, 0) as sales_today,
        COALESCE(stats.revenue_today, 0) as revenue_today,
        rs.shift_id,
        rs.opened_at as shift_start,
        r.register_name
      FROM users u
      LEFT JOIN register_shifts rs ON rs.user_id = u.id AND rs.status = 'open'
      LEFT JOIN registers r ON rs.register_id = r.register_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT t.transaction_id) as sales_today,
          COALESCE(SUM(t.total_amount), 0) as revenue_today
        FROM transactions t
        WHERE t.salesperson_id = u.id
          AND t.status = 'completed'
          AND DATE(t.created_at) = $1
      ) stats ON true
      WHERE u.id = $2 AND u.is_active = true
    `, [today, repId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRep(result.rows[0], !!result.rows[0].shift_id);
  }

  /**
   * Format a rep row from database to response format
   * @private
   */
  formatRep(row, isOnShift) {
    return {
      id: row.id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
      firstName: row.first_name,
      lastName: row.last_name,
      initials: this.getInitials(row.first_name, row.last_name),
      email: row.email,
      role: row.role,
      department: row.department,
      avatarUrl: row.avatar_url || null,
      isOnShift: isOnShift,
      shiftStart: row.shift_start || null,
      shiftId: row.shift_id || null,
      registerName: row.register_name || null,
      salesToday: parseInt(row.sales_today, 10) || 0,
      revenueToday: parseFloat(row.revenue_today) || 0,
    };
  }
}

module.exports = SalesRepService;
