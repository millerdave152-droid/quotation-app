/**
 * HNSW Index Health Check
 *
 * Checks the health of pgvector HNSW indexes on search_embedding columns.
 * Warns when table row counts approach the threshold where the default
 * m=16, ef_construction=64 parameters start degrading recall.
 *
 * Thresholds:
 *   < 40,000 rows  → OK (safe with defaults)
 *   40,000–50,000  → WARNING (80% of safe threshold, plan reindex)
 *   > 50,000       → REINDEX_REQUIRED (recall degradation likely)
 *
 * Usage:
 *   const { checkHnswHealth } = require('./scripts/check-hnsw-health');
 *   const report = await checkHnswHealth(pool);
 */

const logger = require('../utils/logger');

const INDEXES = [
  { indexName: 'idx_products_search_embedding', table: 'products' },
  { indexName: 'idx_customers_search_embedding', table: 'customers' },
  { indexName: 'idx_quotations_search_embedding', table: 'quotations' },
  { indexName: 'idx_customer_notes_search_embedding', table: 'customer_notes' },
];

const SAFE_THRESHOLD = 50000;
const WARNING_THRESHOLD = 40000; // 80% of safe

async function checkHnswHealth(pool) {
  const report = [];

  for (const { indexName, table } of INDEXES) {
    try {
      // Row count
      const countResult = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      const rowCount = countResult.rows[0]?.cnt || 0;

      // Index stats (may not exist if table has no rows with embeddings)
      const indexResult = await pool.query(
        'SELECT idx_scan, idx_tup_read, idx_tup_fetch FROM pg_stat_user_indexes WHERE indexrelname = $1',
        [indexName]
      );
      const indexStats = indexResult.rows[0] || null;

      // Determine status
      let status = 'OK';
      if (rowCount > SAFE_THRESHOLD) {
        status = 'REINDEX_REQUIRED';
      } else if (rowCount > WARNING_THRESHOLD) {
        status = 'WARNING';
      }

      const entry = {
        indexName,
        table,
        rowCount,
        status,
        indexExists: indexStats !== null,
        scans: indexStats?.idx_scan || 0,
        tuplesRead: indexStats?.idx_tup_read || 0,
      };

      report.push(entry);

      // Log warnings
      if (status === 'WARNING') {
        logger.warn({
          index: indexName,
          table,
          rowCount,
          threshold: SAFE_THRESHOLD,
        }, `[HNSW] ${table} approaching reindex threshold (${rowCount}/${SAFE_THRESHOLD}). Plan REINDEX with m=32, ef_construction=128.`);
      } else if (status === 'REINDEX_REQUIRED') {
        logger.error({
          index: indexName,
          table,
          rowCount,
          threshold: SAFE_THRESHOLD,
        }, `[HNSW] ${table} exceeds safe threshold (${rowCount}/${SAFE_THRESHOLD}). Run: REINDEX INDEX CONCURRENTLY ${indexName};`);
      }
    } catch (err) {
      report.push({
        indexName,
        table,
        rowCount: -1,
        status: 'ERROR',
        error: err.message,
      });
    }
  }

  return report;
}

module.exports = { checkHnswHealth };
