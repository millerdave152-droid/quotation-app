/**
 * Seed Script: Load Canadian cities and names into database
 *
 * Usage: node seeds/seed-lookup-data.js [cities|names|all]
 */

const pool = require('../db');
const citiesData = require('./canadian-cities.json');
const namesData = require('./canadian-names.json');

const BATCH_SIZE = 100;

async function seedCities() {
  const client = await pool.connect();

  try {
    console.log('Seeding Canadian cities...');

    // Check if already seeded
    const countResult = await client.query('SELECT COUNT(*) as count FROM canadian_cities');
    if (parseInt(countResult.rows[0].count) > 0) {
      console.log(`canadian_cities already has ${countResult.rows[0].count} records. Skipping.`);
      console.log('Run with --force to clear and reseed.');
      return;
    }

    await client.query('BEGIN');

    const cities = citiesData.cities;
    const provinces = citiesData.provinces;

    let inserted = 0;

    // Process in batches
    for (let i = 0; i < cities.length; i += BATCH_SIZE) {
      const batch = cities.slice(i, i + BATCH_SIZE);

      const values = [];
      const placeholders = [];

      batch.forEach((city, idx) => {
        const offset = idx * 6;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        values.push(
          city.city,
          city.province,
          provinces[city.province] || city.province,
          city.pop || 0,
          city.lat || null,
          city.lng || null
        );
      });

      await client.query(`
        INSERT INTO canadian_cities (city_name, province_code, province_name, population, latitude, longitude)
        VALUES ${placeholders.join(', ')}
      `, values);

      inserted += batch.length;

      if (inserted % 500 === 0) {
        console.log(`  Inserted ${inserted} cities...`);
      }
    }

    await client.query('COMMIT');

    console.log(`\n✓ Seeded ${inserted} Canadian cities`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding cities:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function seedNames() {
  const client = await pool.connect();

  try {
    console.log('Seeding Canadian names...');

    // Check if already seeded
    const countResult = await client.query('SELECT COUNT(*) as count FROM canadian_names');
    if (parseInt(countResult.rows[0].count) > 0) {
      console.log(`canadian_names already has ${countResult.rows[0].count} records. Skipping.`);
      console.log('Run with --force to clear and reseed.');
      return;
    }

    await client.query('BEGIN');

    let inserted = 0;

    // Seed first names
    const firstNames = namesData.first_names;
    for (let i = 0; i < firstNames.length; i += BATCH_SIZE) {
      const batch = firstNames.slice(i, i + BATCH_SIZE);

      const values = [];
      const placeholders = [];

      batch.forEach((name, idx) => {
        const offset = idx * 3;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
        values.push(name.name, 'first', name.freq || 0);
      });

      await client.query(`
        INSERT INTO canadian_names (name, name_type, frequency)
        VALUES ${placeholders.join(', ')}
      `, values);

      inserted += batch.length;
    }

    console.log(`  Inserted ${inserted} first names`);

    // Seed last names
    const lastNames = namesData.last_names;
    let lastInserted = 0;

    for (let i = 0; i < lastNames.length; i += BATCH_SIZE) {
      const batch = lastNames.slice(i, i + BATCH_SIZE);

      const values = [];
      const placeholders = [];

      batch.forEach((name, idx) => {
        const offset = idx * 3;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
        values.push(name.name, 'last', name.freq || 0);
      });

      await client.query(`
        INSERT INTO canadian_names (name, name_type, frequency)
        VALUES ${placeholders.join(', ')}
      `, values);

      lastInserted += batch.length;
    }

    console.log(`  Inserted ${lastInserted} last names`);

    await client.query('COMMIT');

    console.log(`\n✓ Seeded ${inserted + lastInserted} total names`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding names:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function clearData() {
  const client = await pool.connect();

  try {
    console.log('Clearing existing lookup data...');

    await client.query('TRUNCATE canadian_cities RESTART IDENTITY');
    await client.query('TRUNCATE canadian_names RESTART IDENTITY');
    await client.query('TRUNCATE postal_code_cache RESTART IDENTITY');

    console.log('✓ Cleared all lookup tables');

  } finally {
    client.release();
  }
}

async function showStats() {
  const client = await pool.connect();

  try {
    const citiesCount = await client.query('SELECT COUNT(*) as count FROM canadian_cities');
    const namesCount = await client.query('SELECT COUNT(*) as count FROM canadian_names');
    const firstCount = await client.query("SELECT COUNT(*) as count FROM canadian_names WHERE name_type = 'first'");
    const lastCount = await client.query("SELECT COUNT(*) as count FROM canadian_names WHERE name_type = 'last'");
    const postalCount = await client.query('SELECT COUNT(*) as count FROM postal_code_cache');

    console.log('\n========================================');
    console.log('Lookup Data Statistics:');
    console.log('========================================');
    console.log(`Canadian Cities:    ${citiesCount.rows[0].count}`);
    console.log(`Canadian Names:     ${namesCount.rows[0].count}`);
    console.log(`  - First Names:    ${firstCount.rows[0].count}`);
    console.log(`  - Last Names:     ${lastCount.rows[0].count}`);
    console.log(`Postal Code Cache:  ${postalCount.rows[0].count}`);
    console.log('========================================\n');

  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'all';
  const force = args.includes('--force');

  try {
    if (force) {
      await clearData();
    }

    switch (action) {
      case 'cities':
        await seedCities();
        break;
      case 'names':
        await seedNames();
        break;
      case 'clear':
        await clearData();
        break;
      case 'stats':
        await showStats();
        break;
      case 'all':
      default:
        await seedCities();
        await seedNames();
        break;
    }

    await showStats();

  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Show usage
if (process.argv.includes('--help')) {
  console.log(`
Seed Lookup Data Script
=======================

Usage: node seeds/seed-lookup-data.js [command] [options]

Commands:
  all       Seed both cities and names (default)
  cities    Seed only Canadian cities
  names     Seed only Canadian names
  clear     Clear all lookup tables
  stats     Show statistics only

Options:
  --force   Clear existing data before seeding
  --help    Show this help message

Examples:
  node seeds/seed-lookup-data.js
  node seeds/seed-lookup-data.js cities
  node seeds/seed-lookup-data.js --force
  node seeds/seed-lookup-data.js stats
`);
  process.exit(0);
}

main();
