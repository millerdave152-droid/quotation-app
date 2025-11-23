const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMigration() {
    console.log('\n' + '='.repeat(70));
    console.log('DATABASE MIGRATION - Starting');
    console.log('='.repeat(70));
    
    try {
        // Read the FIXED migration SQL file
        const sqlPath = path.join(__dirname, 'database-migration-fixed.sql');
        console.log(`Reading SQL file: ${sqlPath}`);
        
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log('✓ SQL file loaded successfully');
        
        console.log('\nConnecting to database...');
        console.log(`Host: quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com`);
        console.log(`Database: quotationapp`);
        
        console.log('\nExecuting migration...');
        await pool.query(sql);
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(70));
        
        // Verify tables
        console.log('\nVerifying new tables...');
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
                AND table_name IN ('price_history', 'import_logs', 'import_errors', 'sync_status')
            ORDER BY table_name;
        `;
        
        const tablesResult = await pool.query(tablesQuery);
        console.log(`✓ Created ${tablesResult.rows.length}/4 new tables:`);
        tablesResult.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });
        
        // Verify columns
        console.log('\nVerifying new columns in products table...');
        const columnsQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' 
                AND column_name IN ('import_source', 'import_date', 'last_price_change_date', 'last_price_change_amount', 'import_file_name')
            ORDER BY column_name;
        `;
        
        const columnsResult = await pool.query(columnsQuery);
        console.log(`✓ Added ${columnsResult.rows.length}/5 new columns:`);
        columnsResult.rows.forEach(row => {
            console.log(`  - ${row.column_name}`);
        });
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ MIGRATION VERIFICATION COMPLETE!');
        console.log('='.repeat(70));
        console.log('\n✅ You can now proceed to the next step!\n');
        
    } catch (error) {
        console.error('\n' + '='.repeat(70));
        console.error('❌ MIGRATION FAILED');
        console.error('='.repeat(70));
        console.error('\nError:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();