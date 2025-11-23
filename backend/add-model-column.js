// add-model-column.js
// Run this once to add the model column to the products table

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

async function addModelColumn() {
  try {
    console.log('🔄 Connecting to database...');
    
    // Add model column
    console.log('📝 Adding model column...');
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS model VARCHAR(255)
    `);
    console.log('✅ Model column added successfully!');
    
    // Create unique index on model
    console.log('🔑 Creating unique index on model...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS products_model_key 
      ON products(model)
    `);
    console.log('✅ Unique index created successfully!');
    
    // Show updated table structure
    console.log('\n📊 Updated table structure:');
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'products'
      ORDER BY ordinal_position
    `);
    
    console.table(result.rows);
    
    console.log('\n✅ Database update complete! You can now import LG products.');
    
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
  } finally {
    await pool.end();
  }
}

addModelColumn();