/**
 * TeleTime POS - Audit Log Service (Hash-Chain)
 * PCI DSS v4.0.1 Requirement 10 compliant audit logging.
 *
 * Provides tamper-evident logging with SHA-256 hash chain.
 * Each record's hash includes the previous record's hash, creating
 * a verifiable chain of integrity. A promise-based mutex serialises
 * writes so the in-memory chain head is never stale.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const GENESIS = 'GENESIS';

class AuditLogService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
    this._chainHead = null;   // in-memory last record_hash
    this._initialized = false;
    this._mutex = Promise.resolve(); // promise-based write queue
  }

  // ============================================================================
  // STARTUP
  // ============================================================================

  /**
   * Initialise the chain head from the last DB record.
   * Must be called once before the Express server starts accepting requests.
   */
  async initializeChain() {
    try {
      const { rows } = await this.pool.query(
        'SELECT entry_hash FROM audit_log WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1'
      );
      this._chainHead = rows[0]?.entry_hash || GENESIS;
      this._initialized = true;
      logger.info({ chainHead: this._chainHead.substring(0, 12) + '...' },
        '[AuditLog] Hash chain initialised');
    } catch (err) {
      // Graceful degradation — start with GENESIS if DB unreachable at boot
      logger.error({ err }, '[AuditLog] Failed to initialise chain from DB — starting with GENESIS');
      this._chainHead = GENESIS;
      this._initialized = true;
    }
  }

  // ============================================================================
  // PRIMARY API — logEvent
  // ============================================================================

  /**
   * Record an audit event with hash-chain integrity.
   *
   * This is the primary entry point. It is safe to fire-and-forget from
   * middleware (no await needed) — errors are logged but never thrown.
   *
   * @param {object} eventData
   * @param {string}  eventData.eventType     - e.g. 'sale', 'login', 'stock_adjust'
   * @param {string}  eventData.eventCategory - e.g. 'transaction', 'auth', 'inventory'
   * @param {string}  [eventData.severity='info'] - 'info' | 'warning' | 'error' | 'critical'
   * @param {number}  [eventData.employeeId]  - user performing the action
   * @param {number}  [eventData.terminalId]  - POS terminal
   * @param {number}  [eventData.locationId]  - store / location
   * @param {number}  [eventData.transactionId] - related transaction PK
   * @param {string}  [eventData.entityType]  - entity type for legacy compat
   * @param {*}       [eventData.entityId]    - entity PK for legacy compat
   * @param {object}  [eventData.details={}]  - arbitrary JSON payload
   * @param {string}  [eventData.ipAddress]   - client IP
   * @param {string}  [eventData.userAgent]   - client UA string
   */
  logEvent(eventData) {
    // Enqueue into the serial write queue — callers should NOT await this
    this._mutex = this._mutex
      .then(() => this._writeRecord(eventData))
      .catch(err => {
        logger.error({ err, eventType: eventData.eventType },
          '[AuditLog] Failed to write audit record — event dropped');
      });
    return this._mutex;
  }

  // ============================================================================
  // BACKWARD-COMPATIBLE WRAPPER
  // ============================================================================

  /**
   * Legacy interface used by FraudDetectionService.logAuditEntry() and
   * existing fraud/discount routes.
   *
   * @param {number} userId
   * @param {string} action        - e.g. 'fraud.alert.review'
   * @param {string} entityType    - e.g. 'transaction', 'fraud_alert'
   * @param {*}      entityId
   * @param {object} details
   * @param {object|null} req      - Express request (for IP / UA extraction)
   */
  log(userId, action, entityType, entityId, details = {}, req = null) {
    return this.logEvent({
      eventType: action,
      eventCategory: details.event_category || this._deriveEventCategory(action),
      severity: details.severity || 'info',
      employeeId: userId,
      terminalId: details.terminal_id || req?.body?.terminal_id || req?.body?.terminalId || null,
      locationId: details.location_id || req?.body?.location_id || req?.body?.locationId || null,
      transactionId: details.transaction_id || req?.body?.transaction_id || req?.body?.transactionId || null,
      entityType,
      entityId,
      details,
      ipAddress: req
        ? (req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || null)
        : null,
      userAgent: req?.headers?.['user-agent'] || null,
      _shiftId: details.shift_id || req?.body?.shiftId || req?.body?.shift_id || null,
      _riskScore: details.risk_score || null,
    });
  }

  // ============================================================================
  // CHAIN VERIFICATION
  // ============================================================================

  /**
   * Verify the hash chain integrity over a range of audit records.
   * Reads records from DB and recomputes each hash, checking both the
   * record hash and the previous_hash linkage.
   *
   * @param {number|null} startId - First record id (null = beginning)
   * @param {number|null} endId   - Last record id  (null = latest)
   * @returns {Promise<{verified: number, violations: Array}>}
   */
  async verifyChain(startId = null, endId = null) {
    const conditions = ['entry_hash IS NOT NULL'];
    const params = [];
    let idx = 1;

    if (startId) { conditions.push(`id >= $${idx++}`); params.push(startId); }
    if (endId)   { conditions.push(`id <= $${idx++}`); params.push(endId); }

    const { rows } = await this.pool.query(
      `SELECT id, user_id, action, entity_type, entity_id, details,
              prev_hash, entry_hash
       FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY id ASC`,
      params
    );

    if (rows.length === 0) {
      return { verified: 0, violations: [] };
    }

    const violations = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const details = typeof row.details === 'string'
        ? JSON.parse(row.details) : (row.details || {});

      // Recompute record hash
      const computedHash = this._computeHash(
        row.prev_hash, row.user_id, row.action,
        row.entity_type, row.entity_id, details
      );

      if (computedHash !== row.entry_hash) {
        violations.push({
          id: row.id,
          type: 'hash_mismatch',
          expected: computedHash,
          actual: row.entry_hash,
        });
      }

      // Check chain linkage: prev_hash must equal previous row's entry_hash
      if (i > 0 && row.prev_hash !== rows[i - 1].entry_hash) {
        violations.push({
          id: row.id,
          type: 'chain_break',
          expected: rows[i - 1].entry_hash,
          actual: row.prev_hash,
        });
      }
    }

    return { verified: rows.length, violations };
  }

  // ============================================================================
  // DATE-RANGE CHAIN VERIFICATION
  // ============================================================================

  /**
   * Verify hash chain integrity for a date range.
   * Fetches one record before the range to anchor the chain linkage.
   * If violations are found, logs a critical audit event.
   *
   * @param {string|Date} startDate - Range start (inclusive)
   * @param {string|Date} endDate   - Range end (inclusive)
   * @returns {Promise<{totalRecords: number, verified: number, violations: Array, checked_at: string}>}
   */
  async verifyChainIntegrity(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Fetch one record before the range to anchor the chain
    const { rows: anchorRows } = await this.pool.query(
      `SELECT id, entry_hash FROM audit_log
       WHERE entry_hash IS NOT NULL AND created_at < $1
       ORDER BY id DESC LIMIT 1`,
      [start.toISOString()]
    );
    const anchorHash = anchorRows[0]?.entry_hash || null;
    const anchorId = anchorRows[0]?.id || null;

    // Fetch all records in the date range
    const { rows } = await this.pool.query(
      `SELECT id, user_id, action, entity_type, entity_id, details,
              prev_hash, entry_hash, created_at
       FROM audit_log
       WHERE entry_hash IS NOT NULL
         AND created_at >= $1 AND created_at <= $2
       ORDER BY id ASC`,
      [start.toISOString(), end.toISOString()]
    );

    if (rows.length === 0) {
      return { totalRecords: 0, verified: 0, violations: [], checked_at: new Date().toISOString() };
    }

    const violations = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const details = typeof row.details === 'string'
        ? JSON.parse(row.details) : (row.details || {});

      // Recompute record hash
      const computedHash = this._computeHash(
        row.prev_hash, row.user_id, row.action,
        row.entity_type, row.entity_id, details
      );

      if (computedHash !== row.entry_hash) {
        violations.push({
          id: row.id,
          type: 'hash_mismatch',
          expected: computedHash,
          actual: row.entry_hash,
          created_at: row.created_at,
        });
      }

      // Chain linkage check
      if (i === 0 && anchorHash && row.prev_hash !== anchorHash) {
        violations.push({
          id: row.id,
          type: 'chain_break',
          expected: anchorHash,
          actual: row.prev_hash,
          created_at: row.created_at,
        });
      } else if (i > 0 && row.prev_hash !== rows[i - 1].entry_hash) {
        violations.push({
          id: row.id,
          type: 'chain_break',
          expected: rows[i - 1].entry_hash,
          actual: row.prev_hash,
          created_at: row.created_at,
        });
      }
    }

    // If violations found, log a critical audit event
    if (violations.length > 0) {
      this.logEvent({
        eventType: 'audit.chain_violation',
        eventCategory: 'system',
        severity: 'critical',
        details: {
          violation_count: violations.length,
          date_range: { start: startDate, end: endDate },
          violation_ids: violations.map(v => v.id),
        },
      });
    }

    const result = {
      totalRecords: rows.length,
      verified: rows.length - violations.length,
      violations,
      checked_at: new Date().toISOString(),
      date_range: { start: start.toISOString(), end: end.toISOString() },
    };

    // Cache last verification result
    this._lastVerification = result;

    return result;
  }

  /**
   * Get the last verification result (cached in memory).
   * @returns {object|null}
   */
  getLastVerification() {
    return this._lastVerification || null;
  }

  // ============================================================================
  // PCI DSS REQUIREMENT 10 — COMPLIANCE REPORT
  // ============================================================================

  /**
   * Generate a PCI DSS Requirement 10 compliance summary.
   *
   * @param {string} period - 'day', 'week', 'month', 'quarter', 'year'
   * @returns {Promise<object>} Compliance report
   */
  async generateComplianceReport(period = 'month') {
    const now = new Date();
    let periodStart;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 7);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        periodStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const startIso = periodStart.toISOString();
    const endIso = now.toISOString();

    // Run all queries in parallel
    const [
      categoryResult,
      severityResult,
      failedLoginsResult,
      failedLoginsByEmployeeResult,
      failedLoginsByIpResult,
      afterHoursResult,
      configChangesResult,
      dataExportsResult,
      privilegeResult,
      retentionResult,
      totalCountResult,
    ] = await Promise.all([
      // 1) Events by category
      this.pool.query(`
        SELECT COALESCE(event_category, 'general') AS category, COUNT(*)::int AS count
        FROM audit_log
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY event_category
        ORDER BY count DESC
      `, [startIso, endIso]),

      // 2) Events by severity
      this.pool.query(`
        SELECT COALESCE(severity, 'info') AS severity, COUNT(*)::int AS count
        FROM audit_log
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY severity
        ORDER BY CASE severity
          WHEN 'critical' THEN 1 WHEN 'error' THEN 2
          WHEN 'warning' THEN 3 ELSE 4 END
      `, [startIso, endIso]),

      // 3) Failed login attempts (total count)
      this.pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_log
        WHERE action IN ('login_failed', 'auth.login_failed')
          AND created_at >= $1 AND created_at <= $2
      `, [startIso, endIso]),

      // 4) Failed logins by employee
      this.pool.query(`
        SELECT user_id, COUNT(*)::int AS count
        FROM audit_log
        WHERE action IN ('login_failed', 'auth.login_failed')
          AND created_at >= $1 AND created_at <= $2
          AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY count DESC
        LIMIT 10
      `, [startIso, endIso]),

      // 5) Failed logins by IP
      this.pool.query(`
        SELECT ip_address, COUNT(*)::int AS count
        FROM audit_log
        WHERE action IN ('login_failed', 'auth.login_failed')
          AND created_at >= $1 AND created_at <= $2
          AND ip_address IS NOT NULL
        GROUP BY ip_address
        ORDER BY count DESC
        LIMIT 10
      `, [startIso, endIso]),

      // 6) After-hours access (10 PM - 6 AM)
      this.pool.query(`
        SELECT COUNT(*)::int AS count,
               COUNT(DISTINCT user_id)::int AS unique_users
        FROM audit_log
        WHERE created_at >= $1 AND created_at <= $2
          AND (EXTRACT(HOUR FROM created_at) >= 22 OR EXTRACT(HOUR FROM created_at) < 6)
      `, [startIso, endIso]),

      // 7) Configuration changes
      this.pool.query(`
        SELECT action, user_id, details, created_at
        FROM audit_log
        WHERE action LIKE 'config%' OR action LIKE 'config.%' OR event_category = 'config'
          AND created_at >= $1 AND created_at <= $2
        ORDER BY created_at DESC
        LIMIT 50
      `, [startIso, endIso]),

      // 8) Data export events
      this.pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_log
        WHERE (action LIKE '%export%' OR action LIKE '%download%' OR event_category = 'export')
          AND created_at >= $1 AND created_at <= $2
      `, [startIso, endIso]),

      // 9) Admin/privilege escalation events
      this.pool.query(`
        SELECT COUNT(*)::int AS count
        FROM audit_log
        WHERE (action LIKE '%role%' OR action LIKE '%permission%' OR action LIKE '%privilege%'
               OR action LIKE '%admin%' OR action = 'user_registered')
          AND created_at >= $1 AND created_at <= $2
      `, [startIso, endIso]),

      // 10) Retention compliance — oldest record, 3-month and 12-month counts
      this.pool.query(`
        SELECT
          MIN(created_at) AS oldest_record,
          MAX(created_at) AS newest_record,
          COUNT(*)::int AS total_records,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '3 months')::int AS last_3_months,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '12 months')::int AS last_12_months,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '12 months')::int AS older_than_12_months
        FROM audit_log
      `),

      // 11) Total events in period
      this.pool.query(`
        SELECT COUNT(*)::int AS total FROM audit_log
        WHERE created_at >= $1 AND created_at <= $2
      `, [startIso, endIso]),
    ]);

    // Chain integrity status
    const chainStatus = this._lastVerification || { checked_at: null, violations: [] };

    const retention = retentionResult.rows[0];
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const report = {
      report_period: { start: startIso, end: endIso, period },
      generated_at: new Date().toISOString(),
      total_events: totalCountResult.rows[0].total,

      // Req 10.2 — events by category
      events_by_category: categoryResult.rows,

      // Events by severity
      events_by_severity: severityResult.rows,

      // Req 10.2.4 — failed login attempts
      failed_logins: {
        total: failedLoginsResult.rows[0].count,
        by_employee: failedLoginsByEmployeeResult.rows,
        by_ip: failedLoginsByIpResult.rows,
      },

      // Req 10.6.1 — after-hours access
      after_hours_access: {
        total_events: afterHoursResult.rows[0].count,
        unique_users: afterHoursResult.rows[0].unique_users,
      },

      // Req 10.2.2 — config changes (actions by root/admin)
      configuration_changes: {
        total: configChangesResult.rows.length,
        recent: configChangesResult.rows.slice(0, 10),
      },

      // Req 10.2.5 — data exports
      data_exports: {
        total: dataExportsResult.rows[0].count,
      },

      // Req 10.2.7 — privilege escalation
      privilege_events: {
        total: privilegeResult.rows[0].count,
      },

      // Req 10.5 — hash chain integrity
      chain_integrity: {
        status: chainStatus.violations?.length === 0 ? 'verified' : (chainStatus.checked_at ? 'violations_detected' : 'not_checked'),
        last_checked: chainStatus.checked_at || null,
        violations_count: chainStatus.violations?.length || 0,
      },

      // Req 10.7 — log retention
      retention: {
        oldest_record: retention.oldest_record,
        newest_record: retention.newest_record,
        total_records: retention.total_records,
        last_3_months: retention.last_3_months,
        last_12_months: retention.last_12_months,
        older_than_12_months: retention.older_than_12_months,
        immediate_access_compliant: retention.oldest_record
          ? new Date(retention.oldest_record) <= threeMonthsAgo
          : false,
        annual_retention_compliant: retention.oldest_record
          ? new Date(retention.oldest_record) <= twelveMonthsAgo
          : false,
      },
    };

    // Cache the report
    this._lastComplianceReport = report;

    return report;
  }

  /**
   * Get the last cached compliance report.
   * @returns {object|null}
   */
  getLastComplianceReport() {
    return this._lastComplianceReport || null;
  }

  // ============================================================================
  // INTERNALS
  // ============================================================================

  /**
   * Serialised write — called inside the mutex queue so _chainHead is always
   * consistent even under concurrent calls.
   * @private
   */
  async _writeRecord(eventData) {
    // Lazy init if initializeChain() was never explicitly called
    if (!this._initialized) {
      await this.initializeChain();
    }

    const {
      eventType,
      eventCategory,
      severity = 'info',
      employeeId = null,
      terminalId = null,
      locationId = null,
      transactionId = null,
      entityType = null,
      entityId = null,
      details = {},
      ipAddress = null,
      userAgent = null,
      _shiftId = null,
      _riskScore = null,
    } = eventData;

    const prevHash = this._chainHead;
    const action = eventType;
    const userId = employeeId;

    // Compute hash — same algorithm as legacy for chain continuity
    const entryHash = this._computeHash(
      prevHash, userId, action, entityType, entityId, details
    );

    await this.pool.query(
      `INSERT INTO audit_log
        (user_id, action, entity_type, entity_id, details, ip_address,
         shift_id, risk_score, prev_hash, entry_hash,
         event_category, severity, terminal_id, location_id,
         transaction_id, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(details),
        ipAddress,
        _shiftId,
        _riskScore,
        prevHash,
        entryHash,
        eventCategory || this._deriveEventCategory(action),
        severity,
        terminalId,
        locationId,
        transactionId,
        userAgent,
      ]
    );

    // Advance the in-memory chain head
    this._chainHead = entryHash;
  }

  /**
   * Compute SHA-256 hash for an audit entry.
   * Payload order must never change — it is the hash contract.
   * @private
   */
  _computeHash(prevHash, userId, action, entityType, entityId, details) {
    const payload = [
      prevHash || GENESIS,
      String(userId ?? ''),
      action || '',
      entityType || '',
      String(entityId ?? ''),
      JSON.stringify(details || {}),
    ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Derive event category from action prefix.
   * e.g. 'fraud.alert.review' → 'fraud', 'transaction.create' → 'transaction'
   * @private
   */
  _deriveEventCategory(action) {
    if (!action) return 'general';
    const prefix = action.split('.')[0];
    // Also handle underscore-separated legacy actions like 'login_success'
    const underscorePrefix = action.split('_')[0];
    const validCategories = [
      'fraud', 'transaction', 'auth', 'inventory', 'order',
      'quote', 'payment', 'employee', 'system', 'config',
      'login', 'logout', 'password', 'user', 'customer',
      'product', 'discount', 'report', 'export', 'drawer',
    ];
    if (validCategories.includes(prefix)) return prefix;
    if (validCategories.includes(underscorePrefix)) return underscorePrefix;
    // Map common legacy actions to categories
    const legacyMap = {
      sale: 'transaction', void: 'transaction', refund: 'transaction',
      login_success: 'auth', login_failed: 'auth', logout: 'auth',
      user_registered: 'auth', password_changed: 'auth', password_change_failed: 'auth',
      stock_adjust: 'inventory', price_change: 'inventory',
      drawer_open: 'transaction', drawer_close: 'transaction',
      customer_create: 'customer', customer_edit: 'customer',
      product_create: 'inventory', product_edit: 'inventory',
      report_access: 'report', data_export: 'export',
    };
    return legacyMap[action] || 'general';
  }
}

module.exports = AuditLogService;
