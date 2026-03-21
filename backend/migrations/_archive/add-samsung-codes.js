/**
 * Add Missing Samsung Feature Codes
 * Adds feature codes that were missing from initial seed
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

async function addMissingSamsungCodes() {
  console.log('Adding missing Samsung feature codes...\n');

  try {
    // Find Samsung refrigerator feature code rule
    const refrigRuleResult = await pool.query(`
      SELECT r.id FROM nomenclature_rules r
      JOIN nomenclature_templates t ON r.template_id = t.id
      WHERE t.manufacturer = 'SAMSUNG'
        AND t.product_type = 'refrigerator'
        AND r.segment_name = 'Feature Code'
    `);

    if (refrigRuleResult.rows.length > 0) {
      const refrigRuleId = refrigRuleResult.rows[0].id;
      console.log('Found Samsung refrigerator Feature Code rule ID:', refrigRuleId);

      // Add missing codes for refrigerator
      const refrigCodes = [
        { code_value: '7201', code_meaning: 'Ice Maker, LED Display, External Controls' },
        { code_value: '7001', code_meaning: 'Ice Maker, Basic Features' },
        { code_value: '6100', code_meaning: 'Standard Features, Steam Clean' },
        { code_value: '5400', code_meaning: 'FlexWash, Steam' },
        { code_value: '7551', code_meaning: 'Family Hub, Premium Features' },
        { code_value: '7791', code_meaning: 'Bespoke, Custom Panels' }
      ];

      for (const code of refrigCodes) {
        const result = await pool.query(`
          INSERT INTO nomenclature_codes (rule_id, code_value, code_meaning, is_common)
          VALUES ($1, $2, $3, false)
          ON CONFLICT (rule_id, code_value) DO NOTHING
          RETURNING id
        `, [refrigRuleId, code.code_value, code.code_meaning]);

        if (result.rows.length > 0) {
          console.log('  Added:', code.code_value, '-', code.code_meaning);
        } else {
          console.log('  Skipped (exists):', code.code_value);
        }
      }
    } else {
      console.log('Samsung refrigerator Feature Code rule not found');
    }

    // Find Samsung washer feature code rule
    const washerRuleResult = await pool.query(`
      SELECT r.id FROM nomenclature_rules r
      JOIN nomenclature_templates t ON r.template_id = t.id
      WHERE t.manufacturer = 'SAMSUNG'
        AND t.product_type = 'washer'
        AND r.segment_name = 'Feature Code'
    `);

    if (washerRuleResult.rows.length > 0) {
      const washerRuleId = washerRuleResult.rows[0].id;
      console.log('\nFound Samsung washer Feature Code rule ID:', washerRuleId);

      // Add missing codes for washer
      const washerCodes = [
        { code_value: '6100', code_meaning: 'VRT Plus, Smart Care' },
        { code_value: '5400', code_meaning: 'FlexWash, Steam' },
        { code_value: '8500', code_meaning: 'AI Smart Dial, FlexWash' },
        { code_value: '6300', code_meaning: 'SuperSpeed, Steam' },
        { code_value: '5200', code_meaning: 'Standard Features, Self Clean' }
      ];

      for (const code of washerCodes) {
        const result = await pool.query(`
          INSERT INTO nomenclature_codes (rule_id, code_value, code_meaning, is_common)
          VALUES ($1, $2, $3, false)
          ON CONFLICT (rule_id, code_value) DO NOTHING
          RETURNING id
        `, [washerRuleId, code.code_value, code.code_meaning]);

        if (result.rows.length > 0) {
          console.log('  Added:', code.code_value, '-', code.code_meaning);
        } else {
          console.log('  Skipped (exists):', code.code_value);
        }
      }
    } else {
      console.log('Samsung washer Feature Code rule not found');
    }

    console.log('\n✅ Done adding missing Samsung codes!');
  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

addMissingSamsungCodes()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
