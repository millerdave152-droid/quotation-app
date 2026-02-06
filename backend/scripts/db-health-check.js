/**
 * POS Database Health Check
 * Runs diagnostic queries to verify system integrity
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const report = {
  timestamp: new Date().toISOString(),
  status: 'HEALTHY',
  issues: [],
  warnings: [],
  tables: [],
  summary: {}
};

async function runDiagnostics() {
  console.log('\n========================================');
  console.log('  POS DATABASE HEALTH CHECK');
  console.log('  ' + new Date().toLocaleString());
  console.log('========================================\n');

  try {
    // 1. List all tables with row counts
    console.log('1. TABLE ROW COUNTS');
    console.log('-------------------');
    const tableCountsQuery = `
      SELECT
        schemaname,
        relname as table_name,
        n_live_tup as row_count,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC;
    `;
    const tableCounts = await pool.query(tableCountsQuery);

    let totalRows = 0;
    tableCounts.rows.forEach(row => {
      console.log(`  ${row.table_name.padEnd(40)} ${String(row.row_count).padStart(10)} rows  ${row.total_size.padStart(10)}`);
      totalRows += parseInt(row.row_count) || 0;
      report.tables.push({
        name: row.table_name,
        rows: parseInt(row.row_count) || 0,
        size: row.total_size
      });
    });
    console.log(`  ${'TOTAL'.padEnd(40)} ${String(totalRows).padStart(10)} rows`);
    report.summary.totalTables = tableCounts.rows.length;
    report.summary.totalRows = totalRows;

    // 2. Check for foreign key violations
    console.log('\n2. FOREIGN KEY INTEGRITY CHECK');
    console.log('-------------------------------');

    const fkChecks = [
      { name: 'transaction_items -> transactions', query: `
        SELECT COUNT(*) as orphans FROM transaction_items ti
        LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id
        WHERE t.transaction_id IS NULL
      `},
      { name: 'transaction_items -> products', query: `
        SELECT COUNT(*) as orphans FROM transaction_items ti
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE ti.product_id IS NOT NULL AND p.id IS NULL
      `},
      { name: 'payments -> transactions', query: `
        SELECT COUNT(*) as orphans FROM payments p
        LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
        WHERE t.transaction_id IS NULL
      `},
      { name: 'quotation_items -> quotations', query: `
        SELECT COUNT(*) as orphans FROM quotation_items qi
        LEFT JOIN quotations q ON qi.quotation_id = q.id
        WHERE q.id IS NULL
      `},
      { name: 'quotations -> customers', query: `
        SELECT COUNT(*) as orphans FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.customer_id IS NOT NULL AND c.id IS NULL
      `},
      { name: 'transactions -> customers', query: `
        SELECT COUNT(*) as orphans FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        WHERE t.customer_id IS NOT NULL AND c.customer_id IS NULL
      `},
      { name: 'shifts -> users', query: `
        SELECT COUNT(*) as orphans FROM shifts s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE u.id IS NULL
      `},
      { name: 'cash_drawer_events -> shifts', query: `
        SELECT COUNT(*) as orphans FROM cash_drawer_events cde
        LEFT JOIN shifts s ON cde.shift_id = s.id
        WHERE s.id IS NULL
      `}
    ];

    for (const check of fkChecks) {
      try {
        const result = await pool.query(check.query);
        const orphans = parseInt(result.rows[0].orphans) || 0;
        const status = orphans === 0 ? 'OK' : 'ISSUE';
        const icon = orphans === 0 ? '[OK]' : '[!!]';
        console.log(`  ${icon} ${check.name.padEnd(45)} ${orphans} orphans`);
        if (orphans > 0) {
          report.issues.push({
            type: 'FK_VIOLATION',
            description: `${check.name}: ${orphans} orphaned records`,
            severity: 'HIGH'
          });
          report.status = 'ISSUES_FOUND';
        }
      } catch (err) {
        console.log(`  [--] ${check.name.padEnd(45)} (table may not exist)`);
      }
    }

    // 3. Find orphaned records in detail
    console.log('\n3. ORPHANED RECORDS DETAIL');
    console.log('--------------------------');

    const orphanQueries = [
      { name: 'Line items without valid transactions', query: `
        SELECT ti.id, ti.transaction_id, ti.product_name, ti.created_at
        FROM transaction_items ti
        LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id
        WHERE t.transaction_id IS NULL
        LIMIT 5
      `},
      { name: 'Payments without valid transactions', query: `
        SELECT p.id, p.transaction_id, p.amount_cents, p.payment_method, p.created_at
        FROM payments p
        LEFT JOIN transactions t ON p.transaction_id = t.transaction_id
        WHERE t.transaction_id IS NULL
        LIMIT 5
      `},
      { name: 'Quotation items without quotations', query: `
        SELECT qi.id, qi.quotation_id, qi.product_name
        FROM quotation_items qi
        LEFT JOIN quotations q ON qi.quotation_id = q.id
        WHERE q.id IS NULL
        LIMIT 5
      `}
    ];

    for (const oq of orphanQueries) {
      try {
        const result = await pool.query(oq.query);
        if (result.rows.length > 0) {
          console.log(`  [!!] ${oq.name}:`);
          result.rows.forEach(row => {
            console.log(`       ID: ${row.id}, Details: ${JSON.stringify(row)}`);
          });
        } else {
          console.log(`  [OK] ${oq.name}: None found`);
        }
      } catch (err) {
        console.log(`  [--] ${oq.name}: (skipped - table may not exist)`);
      }
    }

    // 4. Verify required indexes exist
    console.log('\n4. INDEX VERIFICATION');
    console.log('---------------------');

    const requiredIndexes = [
      { table: 'transactions', columns: ['customer_id'], name: 'idx_transactions_customer_id' },
      { table: 'transactions', columns: ['shift_id'], name: 'idx_transactions_shift_id' },
      { table: 'transactions', columns: ['status'], name: 'idx_transactions_status' },
      { table: 'transactions', columns: ['created_at'], name: 'idx_transactions_created_at' },
      { table: 'transaction_items', columns: ['transaction_id'], name: 'idx_transaction_items_txn_id' },
      { table: 'transaction_items', columns: ['product_id'], name: 'idx_transaction_items_product_id' },
      { table: 'payments', columns: ['transaction_id'], name: 'idx_payments_transaction_id' },
      { table: 'quotations', columns: ['customer_id'], name: 'idx_quotations_customer_id' },
      { table: 'quotations', columns: ['status'], name: 'idx_quotations_status' },
      { table: 'quotation_items', columns: ['quotation_id'], name: 'idx_quotation_items_quotation_id' },
      { table: 'products', columns: ['sku'], name: 'idx_products_sku' },
      { table: 'customers', columns: ['email'], name: 'idx_customers_email' },
      { table: 'shifts', columns: ['user_id'], name: 'idx_shifts_user_id' },
      { table: 'shifts', columns: ['status'], name: 'idx_shifts_status' }
    ];

    const existingIndexesQuery = `
      SELECT
        t.relname as table_name,
        i.relname as index_name,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relkind = 'r'
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      GROUP BY t.relname, i.relname
      ORDER BY t.relname, i.relname;
    `;

    const existingIndexes = await pool.query(existingIndexesQuery);
    const indexMap = new Map();
    existingIndexes.rows.forEach(row => {
      // Handle columns as array or convert from string
      const cols = Array.isArray(row.columns) ? row.columns : [row.columns];
      const key = `${row.table_name}:${cols.sort().join(',')}`;
      indexMap.set(key, row.index_name);
    });

    let missingIndexes = 0;
    for (const idx of requiredIndexes) {
      const key = `${idx.table}:${idx.columns.sort().join(',')}`;
      const exists = indexMap.has(key);
      const icon = exists ? '[OK]' : '[!!]';
      console.log(`  ${icon} ${idx.table}.${idx.columns.join(', ').padEnd(30)} ${exists ? 'EXISTS' : 'MISSING'}`);
      if (!exists) {
        missingIndexes++;
        report.warnings.push({
          type: 'MISSING_INDEX',
          description: `Index on ${idx.table}(${idx.columns.join(', ')}) is recommended`,
          severity: 'MEDIUM'
        });
      }
    }
    report.summary.missingIndexes = missingIndexes;

    // 5. Check for null values in required fields
    console.log('\n5. REQUIRED FIELD NULL CHECK');
    console.log('----------------------------');

    const nullChecks = [
      { table: 'transactions', field: 'transaction_number', query: `SELECT COUNT(*) as nulls FROM transactions WHERE transaction_number IS NULL` },
      { table: 'transactions', field: 'status', query: `SELECT COUNT(*) as nulls FROM transactions WHERE status IS NULL` },
      { table: 'transactions', field: 'total_cents', query: `SELECT COUNT(*) as nulls FROM transactions WHERE total_cents IS NULL` },
      { table: 'products', field: 'name', query: `SELECT COUNT(*) as nulls FROM products WHERE name IS NULL` },
      { table: 'products', field: 'sku', query: `SELECT COUNT(*) as nulls FROM products WHERE sku IS NULL OR sku = ''` },
      { table: 'customers', field: 'name', query: `SELECT COUNT(*) as nulls FROM customers WHERE name IS NULL OR name = ''` },
      { table: 'quotations', field: 'quote_number', query: `SELECT COUNT(*) as nulls FROM quotations WHERE quote_number IS NULL` },
      { table: 'quotations', field: 'status', query: `SELECT COUNT(*) as nulls FROM quotations WHERE status IS NULL` },
      { table: 'shifts', field: 'status', query: `SELECT COUNT(*) as nulls FROM shifts WHERE status IS NULL` },
      { table: 'payments', field: 'amount_cents', query: `SELECT COUNT(*) as nulls FROM payments WHERE amount_cents IS NULL` },
      { table: 'payments', field: 'payment_method', query: `SELECT COUNT(*) as nulls FROM payments WHERE payment_method IS NULL` }
    ];

    for (const check of nullChecks) {
      try {
        const result = await pool.query(check.query);
        const nullCount = parseInt(result.rows[0].nulls) || 0;
        const icon = nullCount === 0 ? '[OK]' : '[!!]';
        console.log(`  ${icon} ${check.table}.${check.field.padEnd(25)} ${nullCount} null/empty values`);
        if (nullCount > 0) {
          report.warnings.push({
            type: 'NULL_REQUIRED_FIELD',
            description: `${check.table}.${check.field} has ${nullCount} null/empty values`,
            severity: 'MEDIUM'
          });
        }
      } catch (err) {
        console.log(`  [--] ${check.table}.${check.field.padEnd(25)} (skipped)`);
      }
    }

    // 6. Recent failed transactions and error logs
    console.log('\n6. RECENT TRANSACTION STATUS');
    console.log('----------------------------');

    try {
      const txnStatusQuery = `
        SELECT
          status,
          COUNT(*) as count,
          MAX(created_at) as latest
        FROM transactions
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY status
        ORDER BY count DESC;
      `;
      const txnStatus = await pool.query(txnStatusQuery);
      console.log('  Transaction status (last 7 days):');
      txnStatus.rows.forEach(row => {
        const icon = row.status === 'failed' || row.status === 'void' ? '[!!]' : '[OK]';
        console.log(`    ${icon} ${row.status.padEnd(15)} ${String(row.count).padStart(6)} transactions  (latest: ${new Date(row.latest).toLocaleString()})`);
      });
      report.summary.recentTransactions = txnStatus.rows;
    } catch (err) {
      console.log('  (Could not fetch transaction status)');
    }

    // Check for voided transactions
    try {
      const voidedQuery = `
        SELECT
          transaction_id,
          transaction_number,
          total_cents,
          void_reason,
          voided_at,
          voided_by
        FROM transactions
        WHERE status = 'void'
          AND voided_at > NOW() - INTERVAL '7 days'
        ORDER BY voided_at DESC
        LIMIT 10;
      `;
      const voided = await pool.query(voidedQuery);
      if (voided.rows.length > 0) {
        console.log('\n  Recent voided transactions:');
        voided.rows.forEach(row => {
          console.log(`    - ${row.transaction_number}: $${(row.total_cents/100).toFixed(2)} - ${row.void_reason || 'No reason'} (${new Date(row.voided_at).toLocaleString()})`);
        });
      }
    } catch (err) {
      // Void columns may not exist
    }

    // Check shift status
    console.log('\n  Shift Status:');
    try {
      const shiftQuery = `
        SELECT
          s.id,
          s.status,
          s.started_at,
          s.ended_at,
          u.username,
          s.starting_cash_cents,
          s.ending_cash_cents
        FROM shifts s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.started_at > NOW() - INTERVAL '7 days'
        ORDER BY s.started_at DESC
        LIMIT 5;
      `;
      const shifts = await pool.query(shiftQuery);
      shifts.rows.forEach(row => {
        const icon = row.status === 'open' ? '[!!]' : '[OK]';
        console.log(`    ${icon} Shift #${row.id}: ${row.status.padEnd(10)} by ${(row.username || 'Unknown').padEnd(15)} started ${new Date(row.started_at).toLocaleString()}`);
      });

      // Check for unclosed shifts
      const unclosedQuery = `SELECT COUNT(*) as count FROM shifts WHERE status = 'open' AND started_at < NOW() - INTERVAL '24 hours'`;
      const unclosed = await pool.query(unclosedQuery);
      if (parseInt(unclosed.rows[0].count) > 0) {
        console.log(`    [!!] WARNING: ${unclosed.rows[0].count} shifts open for more than 24 hours`);
        report.warnings.push({
          type: 'UNCLOSED_SHIFTS',
          description: `${unclosed.rows[0].count} shifts have been open for more than 24 hours`,
          severity: 'MEDIUM'
        });
      }
    } catch (err) {
      console.log('    (Could not fetch shift status)');
    }

    // 7. Database size and performance
    console.log('\n7. DATABASE SIZE & PERFORMANCE');
    console.log('------------------------------');

    const dbSizeQuery = `SELECT pg_size_pretty(pg_database_size(current_database())) as size;`;
    const dbSize = await pool.query(dbSizeQuery);
    console.log(`  Database size: ${dbSize.rows[0].size}`);
    report.summary.databaseSize = dbSize.rows[0].size;

    // Check for bloated tables
    const bloatQuery = `
      SELECT
        relname as table_name,
        n_dead_tup as dead_tuples,
        n_live_tup as live_tuples,
        CASE WHEN n_live_tup > 0
          THEN round(100.0 * n_dead_tup / n_live_tup, 2)
          ELSE 0
        END as dead_ratio_pct
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 1000
      ORDER BY n_dead_tup DESC
      LIMIT 5;
    `;
    const bloat = await pool.query(bloatQuery);
    if (bloat.rows.length > 0) {
      console.log('\n  Tables with dead tuples (may need VACUUM):');
      bloat.rows.forEach(row => {
        console.log(`    - ${row.table_name}: ${row.dead_tuples} dead tuples (${row.dead_ratio_pct}% of live)`);
      });
    }

    // Final Summary
    console.log('\n========================================');
    console.log('  HEALTH CHECK SUMMARY');
    console.log('========================================');
    console.log(`  Status: ${report.status}`);
    console.log(`  Tables: ${report.summary.totalTables}`);
    console.log(`  Total Rows: ${report.summary.totalRows.toLocaleString()}`);
    console.log(`  Database Size: ${report.summary.databaseSize}`);
    console.log(`  Critical Issues: ${report.issues.length}`);
    console.log(`  Warnings: ${report.warnings.length}`);

    if (report.issues.length > 0) {
      console.log('\n  CRITICAL ISSUES:');
      report.issues.forEach((issue, i) => {
        console.log(`    ${i+1}. [${issue.severity}] ${issue.description}`);
      });
    }

    if (report.warnings.length > 0) {
      console.log('\n  WARNINGS:');
      report.warnings.forEach((warning, i) => {
        console.log(`    ${i+1}. [${warning.severity}] ${warning.description}`);
      });
    }

    console.log('\n========================================\n');

  } catch (error) {
    console.error('Health check error:', error.message);
    report.status = 'ERROR';
    report.error = error.message;
  } finally {
    await pool.end();
  }

  return report;
}

runDiagnostics()
  .then(report => {
    process.exit(report.status === 'ERROR' ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
