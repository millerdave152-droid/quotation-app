const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function fixPriceColumn() {
    try {
        console.log('Making price column nullable...');
        
        await pool.query('ALTER TABLE products ALTER COLUMN price DROP NOT NULL');
        console.log('✓ Price column is now nullable');
        
        await pool.query('UPDATE products SET price = 0 WHERE price IS NULL');
        console.log('✓ Set default for existing products');
        
        console.log('\n✅ Table fixed! Try importing again.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixPriceColumn();