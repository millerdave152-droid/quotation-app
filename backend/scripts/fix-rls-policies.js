/**
 * Fix RLS policies to handle empty string tenant setting
 * Uses NULLIF to convert '' to NULL before casting to UUID
 *
 * Must run as dbadmin (rds_superuser) to modify policies.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

function resolveSslConfig() {
  const sslMode = (process.env.DB_SSL_MODE || '').toLowerCase();
  const sslFlag = (process.env.DB_SSL || '').toLowerCase();
  if (sslMode === 'disable' || sslFlag === 'false' || sslFlag === '0') return false;
  if (sslMode === 'require' || sslFlag === 'true' || sslFlag === '1') {
    const rej = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase();
    return { rejectUnauthorized: rej !== 'false' };
  }
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

// Connect as dbadmin for DDL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: 'dbadmin',
  password: 'QuotationPass123!',
  database: process.env.DB_NAME,
  ssl: resolveSslConfig(),
});

async function fixPolicies() {
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' ORDER BY tablename"
  );
  console.log('Tables with tenant_isolation policy:', rows.length);

  let fixed = 0;
  for (const { tablename } of rows) {
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${tablename}`);
    await pool.query(
      `CREATE POLICY tenant_isolation ON ${tablename}
       USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
       WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`
    );
    fixed++;
  }
  console.log('Fixed', fixed, 'policies with NULLIF wrapper');
  await pool.end();
}

fixPolicies().catch(e => {
  console.error('Error:', e.message);
  pool.end();
  process.exit(1);
});
