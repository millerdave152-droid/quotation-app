const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function setupQuotations() {
    try {
        console.log('\n=== SETTING UP QUOTATIONS SYSTEM ===\n');
        
        // Read and execute SQL file
        const sql = fs.readFileSync('create-quotations-tables.sql', 'utf-8');
        
        await pool.query(sql);
        
        console.log('✅ Created quotations table');
        console.log('✅ Created quotation_items table');
        console.log('✅ Created indexes');
        console.log('✅ Created quotation_summary view');
        
        console.log('\n=== SETUP COMPLETE ===\n');
        console.log('Quotations API is now ready to use!');
        console.log('\nAvailable endpoints:');
        console.log('  GET    /api/quotations           - List all quotations');
        console.log('  GET    /api/quotations/:id       - Get single quotation');
        console.log('  POST   /api/quotations           - Create new quotation');
        console.log('  PATCH  /api/quotations/:id/status - Update status');
        console.log('  DELETE /api/quotations/:id       - Delete quotation\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

setupQuotations();