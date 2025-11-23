/**
 * UPDATE INCOMPLETE PRODUCTS (Referenced in Quotes)
 * ==================================================
 * Interactive script to manually update the 9 incomplete products
 * that are referenced in existing quotes and couldn't be deleted.
 *
 * Features:
 * - Shows product details and which quotes reference it
 * - Allows manual entry of model, manufacturer, MSRP
 * - Auto-calculates MSRP from cost if desired
 * - Updates products in database
 *
 * Run with: node scripts/update-incomplete-products.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getIncompleteProducts() {
  const query = `
    SELECT
      p.id,
      p.model,
      p.manufacturer,
      p.cost_cents,
      p.msrp_cents,
      p.description,
      p.category,
      COUNT(qi.id) as quote_count
    FROM products p
    INNER JOIN quotation_items qi ON p.id = qi.product_id
    WHERE (
      (p.model IS NULL OR p.model = '')
      OR (p.manufacturer IS NULL OR p.manufacturer = '')
      OR p.msrp_cents = 0 OR p.msrp_cents IS NULL
    )
    GROUP BY p.id
    ORDER BY quote_count DESC, p.id
  `;

  const result = await pool.query(query);
  return result.rows;
}

async function getQuotesUsingProduct(productId) {
  const query = `
    SELECT
      q.id,
      q.quote_number,
      q.status,
      c.name as customer_name,
      qi.quantity,
      qi.description as item_description
    FROM quotations q
    INNER JOIN quotation_items qi ON q.id = qi.quotation_id
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE qi.product_id = $1
    ORDER BY q.created_at DESC
  `;

  const result = await pool.query(query, [productId]);
  return result.rows;
}

function displayProduct(product, index, total) {
  console.log('\n' + '='.repeat(70));
  console.log(`PRODUCT ${index + 1} of ${total}`);
  console.log('='.repeat(70));
  console.log(`ID:           ${product.id}`);
  console.log(`Manufacturer: ${product.manufacturer || '❌ MISSING'}`);
  console.log(`Model:        ${product.model || '❌ MISSING'}`);
  console.log(`Description:  ${product.description || 'N/A'}`);
  console.log(`Category:     ${product.category || 'N/A'}`);
  console.log(`Cost:         $${(product.cost_cents / 100).toFixed(2)}`);
  console.log(`MSRP:         $${(product.msrp_cents / 100).toFixed(2)} ${product.msrp_cents === 0 ? '❌ MISSING' : '✓'}`);
  console.log(`Used in:      ${product.quote_count} quote${product.quote_count > 1 ? 's' : ''}`);
}

async function displayQuotes(quotes) {
  if (quotes.length === 0) {
    console.log('\nNo quotes found.');
    return;
  }

  console.log('\n📋 Quotes using this product:');
  console.log('-'.repeat(70));
  quotes.forEach(q => {
    console.log(`  • Quote #${q.quote_number || q.id} (${q.status}) - ${q.customer_name || 'Unknown customer'}`);
    console.log(`    Qty: ${q.quantity}, Description: ${q.item_description || 'N/A'}`);
  });
}

async function updateProduct(productId, updates) {
  const setParts = [];
  const values = [];
  let paramIndex = 1;

  if (updates.manufacturer !== undefined) {
    setParts.push(`manufacturer = $${paramIndex++}`);
    values.push(updates.manufacturer);
  }

  if (updates.model !== undefined) {
    setParts.push(`model = $${paramIndex++}`);
    values.push(updates.model);
  }

  if (updates.msrp_cents !== undefined) {
    setParts.push(`msrp_cents = $${paramIndex++}`);
    values.push(updates.msrp_cents);
    setParts.push(`price = $${paramIndex++}`);
    values.push(updates.msrp_cents); // Also update price field
  }

  if (updates.description !== undefined) {
    setParts.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }

  if (updates.category !== undefined) {
    setParts.push(`category = $${paramIndex++}`);
    values.push(updates.category);
  }

  if (setParts.length === 0) {
    return false;
  }

  setParts.push(`last_updated = CURRENT_TIMESTAMP`);
  values.push(productId);

  const query = `
    UPDATE products
    SET ${setParts.join(', ')}
    WHERE id = $${paramIndex}
  `;

  await pool.query(query, values);
  return true;
}

async function processProduct(product, index, total) {
  displayProduct(product, index, total);

  const quotes = await getQuotesUsingProduct(product.id);
  await displayQuotes(quotes);

  console.log('\n' + '-'.repeat(70));
  console.log('OPTIONS:');
  console.log('  1. Update this product manually');
  console.log('  2. Auto-calculate MSRP from cost (with markup)');
  console.log('  3. Skip this product');
  console.log('  4. Delete this product and remove from quotes (⚠️  DESTRUCTIVE)');
  console.log('  5. Exit script');
  console.log('-'.repeat(70));

  const choice = await question('\nChoose an option (1-5): ');

  switch (choice.trim()) {
    case '1':
      return await manualUpdate(product);

    case '2':
      return await autoCalculateMSRP(product);

    case '3':
      console.log('⏭️  Skipped product');
      return { action: 'skipped' };

    case '4':
      return await deleteProduct(product);

    case '5':
      console.log('👋 Exiting...');
      return { action: 'exit' };

    default:
      console.log('Invalid choice. Skipping...');
      return { action: 'skipped' };
  }
}

async function manualUpdate(product) {
  console.log('\n📝 Manual Update');
  console.log('(Press Enter to keep current value)');
  console.log('-'.repeat(70));

  const updates = {};

  // Manufacturer
  if (!product.manufacturer || product.manufacturer === '') {
    const manufacturer = await question('Enter Manufacturer: ');
    if (manufacturer.trim()) {
      updates.manufacturer = manufacturer.trim().toUpperCase();
    }
  } else {
    const manufacturer = await question(`Manufacturer [${product.manufacturer}]: `);
    if (manufacturer.trim()) {
      updates.manufacturer = manufacturer.trim().toUpperCase();
    }
  }

  // Model
  if (!product.model || product.model === '') {
    const model = await question('Enter Model: ');
    if (model.trim()) {
      updates.model = model.trim().toUpperCase();
    }
  } else {
    const model = await question(`Model [${product.model}]: `);
    if (model.trim()) {
      updates.model = model.trim().toUpperCase();
    }
  }

  // MSRP
  if (product.msrp_cents === 0 || !product.msrp_cents) {
    const msrp = await question('Enter MSRP (dollars): $');
    if (msrp.trim()) {
      const msrpDollars = parseFloat(msrp);
      if (!isNaN(msrpDollars) && msrpDollars > 0) {
        updates.msrp_cents = Math.round(msrpDollars * 100);
      }
    }
  } else {
    const currentMsrp = (product.msrp_cents / 100).toFixed(2);
    const msrp = await question(`MSRP [$${currentMsrp}]: $`);
    if (msrp.trim()) {
      const msrpDollars = parseFloat(msrp);
      if (!isNaN(msrpDollars) && msrpDollars > 0) {
        updates.msrp_cents = Math.round(msrpDollars * 100);
      }
    }
  }

  // Description (optional)
  const description = await question(`Description [${product.description || 'none'}]: `);
  if (description.trim()) {
    updates.description = description.trim();
  }

  if (Object.keys(updates).length === 0) {
    console.log('⚠️  No changes made.');
    return { action: 'skipped' };
  }

  // Confirm
  console.log('\n📋 Summary of changes:');
  if (updates.manufacturer) console.log(`  Manufacturer: ${product.manufacturer || 'none'} → ${updates.manufacturer}`);
  if (updates.model) console.log(`  Model: ${product.model || 'none'} → ${updates.model}`);
  if (updates.msrp_cents) {
    const oldMsrp = (product.msrp_cents / 100).toFixed(2);
    const newMsrp = (updates.msrp_cents / 100).toFixed(2);
    console.log(`  MSRP: $${oldMsrp} → $${newMsrp}`);
  }
  if (updates.description) console.log(`  Description: ${updates.description}`);

  const confirm = await question('\nApply changes? (y/n): ');
  if (confirm.trim().toLowerCase() === 'y') {
    await updateProduct(product.id, updates);
    console.log('✅ Product updated successfully!');
    return { action: 'updated', updates };
  } else {
    console.log('❌ Changes cancelled.');
    return { action: 'cancelled' };
  }
}

async function autoCalculateMSRP(product) {
  console.log('\n🔢 Auto-Calculate MSRP');
  console.log('-'.repeat(70));

  const costDollars = (product.cost_cents / 100).toFixed(2);
  console.log(`Current Cost: $${costDollars}`);

  const markup = await question('Enter markup percentage [40]: ');
  const markupPercent = parseFloat(markup.trim()) || 40;

  const calculatedMSRP = Math.round(product.cost_cents * (1 + markupPercent / 100));
  const msrpDollars = (calculatedMSRP / 100).toFixed(2);

  console.log(`\nCalculated MSRP: $${msrpDollars} (${markupPercent}% markup)`);

  const updates = {
    msrp_cents: calculatedMSRP
  };

  // Still need model and manufacturer
  if (!product.manufacturer || product.manufacturer === '') {
    const manufacturer = await question('Enter Manufacturer: ');
    if (manufacturer.trim()) {
      updates.manufacturer = manufacturer.trim().toUpperCase();
    } else {
      console.log('❌ Manufacturer is required. Cancelling...');
      return { action: 'cancelled' };
    }
  }

  if (!product.model || product.model === '') {
    const model = await question('Enter Model: ');
    if (model.trim()) {
      updates.model = model.trim().toUpperCase();
    } else {
      console.log('❌ Model is required. Cancelling...');
      return { action: 'cancelled' };
    }
  }

  const confirm = await question('\nApply changes? (y/n): ');
  if (confirm.trim().toLowerCase() === 'y') {
    await updateProduct(product.id, updates);
    console.log('✅ Product updated successfully!');
    return { action: 'updated', updates };
  } else {
    console.log('❌ Changes cancelled.');
    return { action: 'cancelled' };
  }
}

async function deleteProduct(product) {
  console.log('\n⚠️  DELETE PRODUCT');
  console.log('-'.repeat(70));
  console.log('WARNING: This will:');
  console.log('  1. Remove this product from all quotes');
  console.log('  2. Delete the product from the database');
  console.log('  3. This action CANNOT be undone!');
  console.log('-'.repeat(70));

  const confirm1 = await question('Are you sure you want to delete? Type "DELETE" to confirm: ');
  if (confirm1.trim() !== 'DELETE') {
    console.log('❌ Deletion cancelled.');
    return { action: 'cancelled' };
  }

  try {
    // Delete quotation_items first
    await pool.query('DELETE FROM quotation_items WHERE product_id = $1', [product.id]);

    // Then delete product
    await pool.query('DELETE FROM products WHERE id = $1', [product.id]);

    console.log('✅ Product and related quote items deleted.');
    return { action: 'deleted' };
  } catch (error) {
    console.error('❌ Error deleting product:', error.message);
    return { action: 'error', error: error.message };
  }
}

async function main() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('UPDATE INCOMPLETE PRODUCTS (Referenced in Quotes)');
    console.log('='.repeat(70));

    const products = await getIncompleteProducts();

    if (products.length === 0) {
      console.log('\n✅ No incomplete products found!');
      return;
    }

    console.log(`\nFound ${products.length} incomplete products to update.`);
    console.log('These products are used in existing quotes and need your attention.');

    const stats = {
      updated: 0,
      skipped: 0,
      deleted: 0,
      cancelled: 0
    };

    for (let i = 0; i < products.length; i++) {
      const result = await processProduct(products[i], i, products.length);

      if (result.action === 'exit') {
        break;
      }

      if (result.action === 'updated') {
        stats.updated++;
      } else if (result.action === 'skipped') {
        stats.skipped++;
      } else if (result.action === 'deleted') {
        stats.deleted++;
      } else if (result.action === 'cancelled') {
        stats.cancelled++;
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Products updated: ${stats.updated}`);
    console.log(`Products skipped: ${stats.skipped}`);
    console.log(`Products deleted: ${stats.deleted}`);
    console.log(`Updates cancelled: ${stats.cancelled}`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { getIncompleteProducts, updateProduct, deleteProduct };
