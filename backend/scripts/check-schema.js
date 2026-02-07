require('dotenv').config();
const pool = require('../db');

async function run() {
  try {
    const loc = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'locations' ORDER BY ordinal_position");
    console.log('LOCATIONS:');
    console.log(loc.rows.map(c => c.column_name + ' (' + c.data_type + ')').join('\n'));

    const ak = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'api_keys' ORDER BY ordinal_position");
    console.log('\nAPI_KEYS:');
    console.log(ak.rows.map(c => c.column_name + ' (' + c.data_type + ')').join('\n'));

    const qt = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'created_by'");
    console.log('\nQUOTATIONS.created_by:');
    console.log(qt.rows.map(c => c.column_name + ' (' + c.data_type + ')').join('\n'));

    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
run();
