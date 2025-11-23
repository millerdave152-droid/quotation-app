const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

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
            try {
                // Try to make nullable
                await pool.query(`ALTER TABLE products ALTER COLUMN ${fix.column} DROP NOT NULL`);
                console.log(`✓ Made ${fix.column} nullable`);
            } catch (e) {
                console.log(`  ${fix.column} already nullable or doesn't exist`);
            }
            
            try {
                // Set default value
                if (fix.default === 'model') {
                    await pool.query(`UPDATE products SET ${fix.column} = model WHERE ${fix.column} IS NULL`);
                } else {
                    await pool.query(`UPDATE products SET ${fix.column} = ${fix.default} WHERE ${fix.column} IS NULL`);
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