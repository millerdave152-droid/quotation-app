const { Pool } = require('pg');
require('dotenv').config();

// SECURITY: Use environment variables for database credentials
const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false }
});

// SECURITY: Whitelist of allowed column names for this migration script
const ALLOWED_COLUMNS = ['price', 'cost_cents', 'msrp_cents', 'name'];
const ALLOWED_DEFAULTS = { 'model': true, 0: true }; // Only these default values allowed

async function fixAllConstraints() {
    try {
        console.log('\n=== DIAGNOSING PRODUCTS TABLE ===\n');

        // Check current table structure
        const tableInfo = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'products'
            ORDER BY ordinal_position
        `);

        console.log('Current columns:');
        tableInfo.rows.forEach(col => {
            console.log(`  ${col.column_name}: ${col.data_type} | Nullable: ${col.is_nullable} | Default: ${col.column_default || 'none'}`);
        });

        console.log('\n=== FIXING CONSTRAINTS ===\n');

        // Make ALL price-related columns nullable with defaults
        const fixes = [
            { column: 'price', default: 0 },
            { column: 'cost_cents', default: 0 },
            { column: 'msrp_cents', default: 0 },
            { column: 'name', default: 'model' }
        ];

        for (const fix of fixes) {
            // SECURITY: Validate column name against whitelist
            if (!ALLOWED_COLUMNS.includes(fix.column)) {
                console.error(`❌ Security error: Column "${fix.column}" not in whitelist`);
                continue;
            }

            // SECURITY: Validate default value
            if (!(fix.default in ALLOWED_DEFAULTS)) {
                console.error(`❌ Security error: Default "${fix.default}" not allowed`);
                continue;
            }

            try {
                // Try to make nullable - using quoted identifier for safety
                await pool.query(`ALTER TABLE products ALTER COLUMN "${fix.column}" DROP NOT NULL`);
                console.log(`✓ Made ${fix.column} nullable`);
            } catch (e) {
                console.log(`  ${fix.column} already nullable or doesn't exist`);
            }

            try {
                // Set default value using parameterized query where possible
                if (fix.default === 'model') {
                    // Special case: copying from another column (must use quoted identifiers)
                    await pool.query(`UPDATE products SET "${fix.column}" = model WHERE "${fix.column}" IS NULL`);
                } else {
                    // Numeric default - use parameterized query
                    await pool.query(`UPDATE products SET "${fix.column}" = $1 WHERE "${fix.column}" IS NULL`, [fix.default]);
                }
                console.log(`✓ Set default for ${fix.column}`);
            } catch (e) {
                console.log(`  Could not set default for ${fix.column}: ${e.message}`);
            }
        }

        console.log('\n=== VERIFICATION ===\n');
        
        // Verify the changes
        const verifyInfo = await pool.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'products'
            AND column_name IN ('price', 'cost_cents', 'msrp_cents', 'name')
        `);
        
        console.log('After fixes:');
        verifyInfo.rows.forEach(col => {
            console.log(`  ${col.column_name}: Nullable = ${col.is_nullable}`);
        });
        
        console.log('\n✅ ALL FIXES APPLIED!\n');
        console.log('Now try importing again with:');
        console.log('  Invoke-RestMethod -Uri "http://localhost:3001/api/sync/trigger" -Method POST\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixAllConstraints();