const { Pool } = require('pg');

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

async function checkSchema() {
    try {
        console.log('\n=== CHECKING PRODUCTS TABLE STRUCTURE ===\n');
        
        // Get all columns from products table
        const query = `
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'products'
            ORDER BY ordinal_position;
        `;
        
        const result = await pool.query(query);
        
        console.log('Columns in products table:');
        console.log('');
        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.column_name} (${row.data_type})`);
        });
        
        console.log('\n=== DONE ===\n');
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();