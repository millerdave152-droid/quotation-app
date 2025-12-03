/**
 * Best Buy Marketplace (Mirakl) Connection Test Script
 * Tests API connectivity and reports status
 */

require('dotenv').config();
const axios = require('axios');

// Configuration from environment
const config = {
  apiUrl: process.env.MIRAKL_API_URL,
  apiKey: process.env.MIRAKL_API_KEY,
  shopId: process.env.MIRAKL_SHOP_ID
};

console.log('='.repeat(60));
console.log('BEST BUY MARKETPLACE CONNECTION TEST');
console.log('='.repeat(60));
console.log('');

// Display configuration (masked key)
console.log('Configuration:');
console.log(`  API URL:  ${config.apiUrl || 'NOT SET'}`);
console.log(`  API Key:  ${config.apiKey ? config.apiKey.substring(0, 8) + '...' + config.apiKey.substring(config.apiKey.length - 4) : 'NOT SET'}`);
console.log(`  Shop ID:  ${config.shopId || 'NOT SET'}`);
console.log('');

// Validate configuration
if (!config.apiUrl || !config.apiKey || !config.shopId) {
  console.log('ERROR: Missing required configuration!');
  console.log('Please ensure MIRAKL_API_URL, MIRAKL_API_KEY, and MIRAKL_SHOP_ID are set in .env');
  process.exit(1);
}

// Create axios client
const client = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Authorization': config.apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 30000
});

// Test functions
async function testShopInfo() {
  console.log('Test 1: Fetching Shop Information...');
  try {
    const response = await client.get('/api/account');
    console.log('  Status: SUCCESS');
    console.log(`  Shop Name: ${response.data.shop_name || 'N/A'}`);
    console.log(`  Shop State: ${response.data.shop_state || 'N/A'}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function testOffersList() {
  console.log('');
  console.log('Test 2: Fetching Offers List...');
  try {
    const response = await client.get('/api/offers', {
      params: { max: 5 }
    });
    const offerCount = response.data.offers?.length || 0;
    const totalCount = response.data.total_count || 0;
    console.log('  Status: SUCCESS');
    console.log(`  Offers Retrieved: ${offerCount}`);
    console.log(`  Total Offers: ${totalCount}`);
    return { success: true, count: totalCount };
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function testOrdersList() {
  console.log('');
  console.log('Test 3: Fetching Recent Orders...');
  try {
    // Get orders from last 30 days
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const response = await client.get('/api/orders', {
      params: {
        start_date: startDate,
        max: 10
      }
    });
    const orderCount = response.data.orders?.length || 0;
    const totalCount = response.data.total_count || 0;
    console.log('  Status: SUCCESS');
    console.log(`  Orders Retrieved: ${orderCount}`);
    console.log(`  Total Orders (30 days): ${totalCount}`);

    // Show recent order states if any
    if (response.data.orders && response.data.orders.length > 0) {
      console.log('  Recent Order States:');
      response.data.orders.slice(0, 5).forEach(order => {
        console.log(`    - Order ${order.order_id}: ${order.order_state}`);
      });
    }
    return { success: true, count: totalCount, orders: response.data.orders };
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function testCategories() {
  console.log('');
  console.log('Test 4: Fetching Product Categories...');
  try {
    const response = await client.get('/api/hierarchies', {
      params: { max: 10 }
    });
    const categoryCount = response.data.hierarchies?.length || 0;
    console.log('  Status: SUCCESS');
    console.log(`  Categories Available: ${categoryCount}`);
    return { success: true, count: categoryCount };
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function testShippingCarriers() {
  console.log('');
  console.log('Test 5: Fetching Shipping Carriers...');
  try {
    const response = await client.get('/api/shipping/carriers');
    const carrierCount = response.data.carriers?.length || 0;
    console.log('  Status: SUCCESS');
    console.log(`  Shipping Carriers: ${carrierCount}`);
    if (response.data.carriers && response.data.carriers.length > 0) {
      console.log('  Available Carriers:');
      response.data.carriers.slice(0, 5).forEach(carrier => {
        console.log(`    - ${carrier.label} (${carrier.code})`);
      });
    }
    return { success: true, count: carrierCount };
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Run all tests
async function runTests() {
  const results = {
    shopInfo: null,
    offers: null,
    orders: null,
    categories: null,
    carriers: null
  };

  try {
    results.shopInfo = await testShopInfo();
    results.offers = await testOffersList();
    results.orders = await testOrdersList();
    results.categories = await testCategories();
    results.carriers = await testShippingCarriers();
  } catch (error) {
    console.log('');
    console.log('CRITICAL ERROR:', error.message);
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('CONNECTION TEST SUMMARY');
  console.log('='.repeat(60));

  const tests = [
    { name: 'Shop Info', result: results.shopInfo },
    { name: 'Offers API', result: results.offers },
    { name: 'Orders API', result: results.orders },
    { name: 'Categories API', result: results.categories },
    { name: 'Carriers API', result: results.carriers }
  ];

  let passCount = 0;
  let failCount = 0;

  tests.forEach(test => {
    const status = test.result?.success ? 'PASS' : 'FAIL';
    const icon = test.result?.success ? '[OK]' : '[X]';
    console.log(`  ${icon} ${test.name}: ${status}`);
    if (test.result?.success) passCount++;
    else failCount++;
  });

  console.log('');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('');

  if (failCount === 0) {
    console.log('SUCCESS! Your Best Buy Marketplace connection is working correctly.');
    console.log('You are ready to sync products and receive orders.');
  } else if (passCount > 0) {
    console.log('PARTIAL SUCCESS: Some API endpoints are working.');
    console.log('Check the failed tests above for details.');
  } else {
    console.log('CONNECTION FAILED: Unable to connect to Best Buy Marketplace.');
    console.log('Please verify your API credentials and try again.');
  }

  console.log('');
  console.log('='.repeat(60));

  return results;
}

// Execute
runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
