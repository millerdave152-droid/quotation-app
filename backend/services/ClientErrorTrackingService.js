'use strict';

/**
 * ClientErrorTrackingService
 * Ingests, queries, and manages client-side error reports.
 */
class ClientErrorTrackingService {
  /**
   * @param {import('pg').Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // INGESTION
  // ============================================================================

  /**
   * Ingest a batch of client errors in a single transaction.
   * Inserts raw rows into client_errors and upserts client_error_groups.
   *
   * @param {Array<object>} errors - Array of error payloads from the client
   * @param {object} meta - Shared metadata (userAgent, userId, shiftId, appVersion)
   * @returns {Promise<{ ingested: number }>}
   */
  async ingestBatch(errors, meta = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let ingested = 0;

      for (const err of errors) {
        const fingerprint = err.fingerprint;
        if (!fingerprint || !err.message) continue;

        const userId = err.userId || meta.userId || null;
        const shiftId = err.shiftId || meta.shiftId || null;

        // 1. Insert raw occurrence
        await client.query(
          `INSERT INTO client_errors
            (fingerprint, error_type, severity, message, stack_trace, component_stack,
             url, user_agent, user_id, shift_id, context, request_id, app_version, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14::timestamptz, NOW()))`,
          [
            fingerprint,
            err.errorType || 'runtime',
            err.severity || 'error',
            err.message,
            err.stackTrace || null,
            err.componentStack || null,
            err.url || null,
            err.userAgent || meta.userAgent || null,
            userId,
            shiftId,
            JSON.stringify(err.context || {}),
            err.requestId || null,
            err.appVersion || meta.appVersion || null,
            err.timestamp || null,
          ]
        );

        // 2. Upsert group
        await client.query(
          `INSERT INTO client_error_groups
            (fingerprint, message, error_type, severity, first_seen, last_seen, occurrence_count, affected_users)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), 1, $5)
           ON CONFLICT (fingerprint) DO UPDATE SET
             last_seen        = NOW(),
             occurrence_count = client_error_groups.occurrence_count + 1,
             affected_users   = CASE
               WHEN $6::int IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM client_errors
                 WHERE fingerprint = $1 AND user_id = $6 AND id != currval('client_errors_id_seq')
               ) THEN client_error_groups.affected_users + 1
               ELSE client_error_groups.affected_users
             END,
             severity = CASE
               WHEN $4 = 'fatal' THEN 'fatal'
               ELSE client_error_groups.severity
             END,
             status = CASE
               WHEN client_error_groups.status = 'resolved' THEN 'open'
               ELSE client_error_groups.status
             END,
             updated_at = NOW()`,
          [
            fingerprint,
            err.message,
            err.errorType || 'runtime',
            err.severity || 'error',
            userId ? 1 : 0,
            userId,
          ]
        );

        ingested++;
      }

      await client.query('COMMIT');
      return { ingested };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // QUERY — Error Groups
  // ============================================================================

  /**
   * Get paginated, filterable error groups.
   * @param {object} filters - { status, severity, errorType, search, dateFrom, dateTo }
   * @param {object} pagination - { page, limit, sortBy, sortDir }
   */
  async getErrorGroups(filters = {}, pagination = {}) {
    const { status, severity, errorType, search, dateFrom, dateTo } = filters;
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 25));
    const offset = (page - 1) * limit;
    const sortBy = ['last_seen', 'first_seen', 'occurrence_count', 'affected_users', 'severity'].includes(pagination.sortBy)
      ? pagination.sortBy : 'last_seen';
    const sortDir = pagination.sortDir === 'ASC' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`g.status = $${idx++}`);
      params.push(status);
    }
    if (severity) {
      conditions.push(`g.severity = $${idx++}`);
      params.push(severity);
    }
    if (errorType) {
      conditions.push(`g.error_type = $${idx++}`);
      params.push(errorType);
    }
    if (search) {
      conditions.push(`g.message ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (dateFrom) {
      conditions.push(`g.last_seen >= $${idx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`g.last_seen <= $${idx++}`);
      params.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM client_error_groups g ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await this.pool.query(
      `SELECT g.*,
              u.first_name || ' ' || u.last_name AS resolved_by_name
       FROM client_error_groups g
       LEFT JOIN users u ON u.id = g.resolved_by
       ${where}
       ORDER BY g.${sortBy} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return {
      groups: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============================================================================
  // QUERY — Group Detail
  // ============================================================================

  /**
   * Get a single error group with its most recent occurrences.
   * @param {number} groupId
   */
  async getErrorGroupDetail(groupId) {
    const groupResult = await this.pool.query(
      `SELECT g.*,
              u.first_name || ' ' || u.last_name AS resolved_by_name
       FROM client_error_groups g
       LEFT JOIN users u ON u.id = g.resolved_by
       WHERE g.id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) return null;
    const group = groupResult.rows[0];

    const occurrences = await this.pool.query(
      `SELECT ce.*,
              u.first_name || ' ' || u.last_name AS user_name
       FROM client_errors ce
       LEFT JOIN users u ON u.id = ce.user_id
       WHERE ce.fingerprint = $1
       ORDER BY ce.created_at DESC
       LIMIT 50`,
      [group.fingerprint]
    );

    return { ...group, occurrences: occurrences.rows };
  }

  // ============================================================================
  // QUERY — Dashboard Stats
  // ============================================================================

  /**
   * Aggregated stats for the error dashboard.
   * @param {string} dateFrom - ISO date (defaults to 7 days ago)
   * @param {string} dateTo   - ISO date (defaults to now)
   */
  async getStats(dateFrom, dateTo) {
    const from = dateFrom || new Date(Date.now() - 7 * 86400000).toISOString();
    const to = dateTo || new Date().toISOString();

    const [totals, openGroups, byType, bySeverity, hourly, topErrors] = await Promise.all([
      // Total errors in period
      this.pool.query(
        `SELECT COUNT(*) AS total_errors,
                COUNT(DISTINCT user_id) AS affected_users
         FROM client_errors
         WHERE created_at >= $1 AND created_at <= $2`,
        [from, to]
      ),
      // Open groups count
      this.pool.query(
        `SELECT COUNT(*) AS open_count FROM client_error_groups WHERE status = 'open'`
      ),
      // Errors by type
      this.pool.query(
        `SELECT error_type, COUNT(*) AS count
         FROM client_errors
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY error_type ORDER BY count DESC`,
        [from, to]
      ),
      // Errors by severity
      this.pool.query(
        `SELECT severity, COUNT(*) AS count
         FROM client_errors
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY severity ORDER BY count DESC`,
        [from, to]
      ),
      // Hourly time series (last 24h)
      this.pool.query(
        `SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS count
         FROM client_errors
         WHERE created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY hour ORDER BY hour`
      ),
      // Top 10 errors by occurrence
      this.pool.query(
        `SELECT g.id, g.fingerprint, g.message, g.error_type, g.severity,
                g.occurrence_count, g.affected_users, g.last_seen, g.status
         FROM client_error_groups g
         WHERE g.last_seen >= $1 AND g.last_seen <= $2
         ORDER BY g.occurrence_count DESC
         LIMIT 10`,
        [from, to]
      ),
    ]);

    return {
      totalErrors: parseInt(totals.rows[0].total_errors),
      affectedUsers: parseInt(totals.rows[0].affected_users),
      openGroups: parseInt(openGroups.rows[0].open_count),
      byType: byType.rows,
      bySeverity: bySeverity.rows,
      hourly: hourly.rows,
      topErrors: topErrors.rows,
    };
  }

  // ============================================================================
  // ACTIONS — Status Updates
  // ============================================================================

  /**
   * Update a single group's status.
   * @param {number} groupId
   * @param {string} status - open | acknowledged | resolved | ignored
   * @param {number|null} userId - Who performed the action
   * @param {string|null} notes
   */
  async updateGroupStatus(groupId, status, userId = null, notes = null) {
    const validStatuses = ['open', 'acknowledged', 'resolved', 'ignored'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const result = await this.pool.query(
      `UPDATE client_error_groups SET
         status      = $1::text,
         resolved_by = CASE WHEN $1::text IN ('resolved','ignored') THEN $2::int ELSE resolved_by END,
         resolved_at = CASE WHEN $1::text IN ('resolved','ignored') THEN NOW() ELSE resolved_at END,
         notes       = COALESCE($3::text, notes),
         updated_at  = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, userId, notes, groupId]
    );

    return result.rows[0] || null;
  }

  /**
   * Bulk-update status for multiple groups.
   * @param {number[]} groupIds
   * @param {string} status
   * @param {number|null} userId
   */
  async bulkUpdateStatus(groupIds, status, userId = null) {
    const validStatuses = ['open', 'acknowledged', 'resolved', 'ignored'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    if (!groupIds || groupIds.length === 0) return { updated: 0 };

    const result = await this.pool.query(
      `UPDATE client_error_groups SET
         status      = $1::text,
         resolved_by = CASE WHEN $1::text IN ('resolved','ignored') THEN $2::int ELSE resolved_by END,
         resolved_at = CASE WHEN $1::text IN ('resolved','ignored') THEN NOW() ELSE resolved_at END,
         updated_at  = NOW()
       WHERE id = ANY($3::int[])
       RETURNING id`,
      [status, userId, groupIds]
    );

    return { updated: result.rowCount };
  }
}

module.exports = ClientErrorTrackingService;
