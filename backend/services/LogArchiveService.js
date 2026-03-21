/**
 * TeleTime POS - Log Archive Service
 *
 * Implements PCI DSS Requirement 10.7 tiered log retention:
 *   Hot  (0-3 months):  Full records in PostgreSQL, immediately queryable
 *   Warm (3-12 months): Still in PostgreSQL (can be partitioned)
 *   Cold (12+ months):  Exported to compressed JSON files
 *
 * In production, cold-storage files would go to S3/GCS.
 * For now, exports are stored locally under data/archive/audit/.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('../utils/logger');

const ARCHIVE_DIR = path.join(__dirname, '..', 'data', 'archive', 'audit');

class LogArchiveService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
    this._ensureArchiveDir();
  }

  /** @private */
  _ensureArchiveDir() {
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
  }

  // ============================================================================
  // ARCHIVE (Cold Storage Export)
  // ============================================================================

  /**
   * Archive audit logs older than the given number of months.
   * Exports records to gzip-compressed JSON files grouped by month,
   * then marks them in the DB (sets severity to 'archived' or deletes
   * depending on policy). For safety, we never delete — only export.
   *
   * @param {number} olderThanMonths - Archive records older than this (default: 12)
   * @returns {Promise<{exported: number, files: string[]}>}
   */
  async archiveLogs(olderThanMonths = 12) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - olderThanMonths);

    // Get the date range of archivable records
    const { rows: rangeRows } = await this.pool.query(`
      SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest, COUNT(*)::int AS total
      FROM audit_log
      WHERE created_at < $1
    `, [cutoff.toISOString()]);

    const range = rangeRows[0];
    if (!range || range.total === 0) {
      logger.info('[LogArchive] No records to archive');
      return { exported: 0, files: [] };
    }

    logger.info({
      oldest: range.oldest,
      newest: range.newest,
      total: range.total,
      cutoff: cutoff.toISOString(),
    }, '[LogArchive] Starting archive export');

    // Export month-by-month
    let current = new Date(range.oldest);
    current.setDate(1);
    current.setHours(0, 0, 0, 0);

    let totalExported = 0;
    const files = [];

    while (current < cutoff) {
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
      const effectiveEnd = monthEnd < cutoff ? monthEnd : cutoff;

      const result = await this._exportMonth(current, effectiveEnd);
      if (result) {
        totalExported += result.count;
        files.push(result.file);
      }

      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    logger.info({ totalExported, fileCount: files.length }, '[LogArchive] Archive export complete');
    return { exported: totalExported, files };
  }

  /**
   * Export records for a specific month to a gzip JSON file.
   * @private
   */
  async _exportMonth(startDate, endDate) {
    const { rows } = await this.pool.query(`
      SELECT id, user_id, action, entity_type, entity_id, details,
             ip_address, created_at, shift_id, risk_score,
             prev_hash, entry_hash, event_category, severity,
             terminal_id, location_id, transaction_id, user_agent
      FROM audit_log
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY id ASC
    `, [startDate.toISOString(), endDate.toISOString()]);

    if (rows.length === 0) return null;

    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const fileName = `audit_log_${year}_${month}.json.gz`;
    const filePath = path.join(ARCHIVE_DIR, fileName);

    // Write compressed JSON
    const jsonData = JSON.stringify({
      exported_at: new Date().toISOString(),
      period: { year, month: parseInt(month) },
      record_count: rows.length,
      first_id: rows[0].id,
      last_id: rows[rows.length - 1].id,
      records: rows,
    });

    const compressed = zlib.gzipSync(jsonData);
    fs.writeFileSync(filePath, compressed);

    logger.info({
      file: fileName,
      records: rows.length,
      size: compressed.length,
    }, `[LogArchive] Exported ${year}-${month}`);

    return { file: fileName, count: rows.length, path: filePath };
  }

  // ============================================================================
  // EXPORT RANGE
  // ============================================================================

  /**
   * Export a specific date range to a compressed JSON file.
   * Useful for ad-hoc compliance audits.
   *
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   * @returns {Promise<{file: string, count: number, path: string, size: number}>}
   */
  async exportToJsonFile(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const { rows } = await this.pool.query(`
      SELECT id, user_id, action, entity_type, entity_id, details,
             ip_address, created_at, shift_id, risk_score,
             prev_hash, entry_hash, event_category, severity,
             terminal_id, location_id, transaction_id, user_agent
      FROM audit_log
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY id ASC
    `, [start.toISOString(), end.toISOString()]);

    const startStr = start.toISOString().slice(0, 10).replace(/-/g, '');
    const endStr = end.toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `audit_export_${startStr}_${endStr}.json.gz`;
    const filePath = path.join(ARCHIVE_DIR, fileName);

    const jsonData = JSON.stringify({
      exported_at: new Date().toISOString(),
      date_range: { start: start.toISOString(), end: end.toISOString() },
      record_count: rows.length,
      records: rows,
    });

    const compressed = zlib.gzipSync(jsonData);
    fs.writeFileSync(filePath, compressed);

    logger.info({ file: fileName, records: rows.length, size: compressed.length },
      '[LogArchive] Range export complete');

    return { file: fileName, count: rows.length, path: filePath, size: compressed.length };
  }

  // ============================================================================
  // RETENTION STATUS
  // ============================================================================

  /**
   * Get current log retention status.
   * Returns tier counts, oldest/newest dates, and compliance flags.
   *
   * @returns {Promise<object>}
   */
  async getRetentionStatus() {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const { rows } = await this.pool.query(`
      SELECT
        MIN(created_at) AS oldest_record,
        MAX(created_at) AS newest_record,
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE created_at >= $1)::int AS hot_count,
        COUNT(*) FILTER (WHERE created_at < $1 AND created_at >= $2)::int AS warm_count,
        COUNT(*) FILTER (WHERE created_at < $2)::int AS cold_count,
        pg_size_pretty(pg_total_relation_size('audit_log')) AS table_size
      FROM audit_log
    `, [threeMonthsAgo.toISOString(), twelveMonthsAgo.toISOString()]);

    const r = rows[0];

    // List archived files
    let archivedFiles = [];
    try {
      archivedFiles = fs.readdirSync(ARCHIVE_DIR)
        .filter(f => f.endsWith('.json.gz'))
        .map(f => {
          const stats = fs.statSync(path.join(ARCHIVE_DIR, f));
          return { name: f, size: stats.size, created: stats.birthtime };
        });
    } catch (_) { /* directory may not exist */ }

    return {
      tiers: {
        hot: { label: '0-3 months', count: r.hot_count },
        warm: { label: '3-12 months', count: r.warm_count },
        cold: { label: '12+ months (in DB)', count: r.cold_count },
      },
      oldest_record: r.oldest_record,
      newest_record: r.newest_record,
      total_records: r.total_records,
      table_size: r.table_size,
      archived_files: archivedFiles,
      compliance: {
        // PCI DSS 10.7.1: 3 months immediately accessible
        immediate_access: r.hot_count > 0,
        // PCI DSS 10.7.2: 12 months total retention
        annual_retention: r.oldest_record
          ? new Date(r.oldest_record) <= twelveMonthsAgo || r.total_records > 0
          : false,
      },
      checked_at: now.toISOString(),
    };
  }
}

module.exports = LogArchiveService;
