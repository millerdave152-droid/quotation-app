require('dotenv').config();
const pool = require('../db');

async function test() {
  // 1. Test transactions query - find the actual query used by the route
  console.log('=== Test 1: Transactions table columns ===');
  try {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='transactions' ORDER BY ordinal_position"
    );
    console.log('columns:', rows.map(r => r.column_name).join(', '));
  } catch (e) { console.log('ERROR:', e.message); }

  // Test the actual transactions list query pattern
  console.log('\n=== Test 1b: Simple transactions SELECT ===');
  try {
    await pool.query('SELECT id, transaction_number, status, total_cents FROM transactions LIMIT 1');
    console.log('PASS: id exists');
  } catch (e) { console.log('FAIL:', e.message); }

  // 2. Test returns table
  console.log('\n=== Test 2: Returns table ===');
  try {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='returns' ORDER BY ordinal_position"
    );
    if (rows.length === 0) {
      console.log('Table "returns" does NOT exist');
      // Check for alternate names
      const { rows: tables } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%return%' AND table_schema='public'"
      );
      console.log('Return-like tables:', tables.map(t => t.table_name).join(', ') || 'NONE');
    } else {
      console.log('columns:', rows.map(r => r.column_name).join(', '));
    }
  } catch (e) { console.log('ERROR:', e.message); }

  // 3. Test quote_follow_ups table and outcome column
  console.log('\n=== Test 3: quote_follow_ups table ===');
  try {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='quote_follow_ups' ORDER BY ordinal_position"
    );
    if (rows.length === 0) {
      console.log('Table "quote_follow_ups" does NOT exist');
    } else {
      console.log('columns:', rows.map(r => r.column_name).join(', '));
      const hasOutcome = rows.some(r => r.column_name === 'outcome');
      console.log('Has outcome column:', hasOutcome);
    }
  } catch (e) { console.log('ERROR:', e.message); }

  // 4. Test drafts table
  console.log('\n=== Test 4: drafts table ===');
  try {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='drafts' ORDER BY ordinal_position"
    );
    if (rows.length === 0) {
      console.log('Table "drafts" does NOT exist');
    } else {
      console.log('columns:', rows.map(r => r.column_name).join(', '));
    }
  } catch (e) { console.log('ERROR:', e.message); }

  pool.end();
}

test();
