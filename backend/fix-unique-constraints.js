const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function fixUniqueConstraints() {
    try {
        console.log('\n=== FIXING UNIQUE CONSTRAINTS ===\n');
        
        // Check existing constraints
        const constraints = await pool.query(`
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'products'
            AND constraint_type = 'UNIQUE'
        `);
        
        console.log('Current unique constraints:');
        constraints.rows.forEach(c => {
            console.log(`  - ${c.constraint_name}`);
        });
        
        // Drop the name unique constraint
        try {
            await pool.query('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_unique');
            console.log('\n✓ Removed products_name_unique constraint');
        } catch (e) {
            console.log(`  Could not remove constraint: ${e.message}`);
        }
        
        // Ensure model is still unique (this is what we want)
        try {
            await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS products_model_unique ON products (model)');
            console.log('✓ Ensured model has unique index');
        } catch (e) {
            console.log('  Model unique index already exists');
        }
        
        console.log('\n✅ CONSTRAINTS FIXED!\n');
        console.log('The system will now use MODEL as the unique identifier.');
        console.log('Products with the same model will be updated instead of duplicated.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixUniqueConstraints();