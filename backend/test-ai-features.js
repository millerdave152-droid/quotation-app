/**
 * Test AI Features
 * Tests Smart Recommendations and Upsell Assistant endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testAIFeatures() {
  console.log('\n========================================');
  console.log('AI FEATURES TEST SUITE');
  console.log('========================================\n');

  try {
    // Test 1: Smart Product Recommendations
    console.log('1. Testing Smart Product Recommendations...');
    const recResponse = await axios.get(`${BASE_URL}/api/ai/recommendations/1784?limit=3`);

    if (recResponse.data.success) {
      console.log('   ✅ Recommendations endpoint working!');
      console.log(`   Base Product: ${recResponse.data.baseProduct.manufacturer} ${recResponse.data.baseProduct.model_number}`);
      console.log(`   Found ${recResponse.data.recommendations.length} recommendations:`);

      recResponse.data.recommendations.forEach((rec, i) => {
        console.log(`      ${i+1}. ${rec.manufacturer} ${rec.modelNumber}`);
        console.log(`         Price: $${rec.msrp} | Margin: ${rec.margin}% | Reason: ${rec.reason}`);
      });
    } else {
      console.log('   ❌ Recommendations endpoint failed');
    }

    console.log('\n2. Testing Intelligent Upsell Assistant...');

    // Get a quote to test with
    const quotesResponse = await axios.get(`${BASE_URL}/api/quotations?limit=1`);

    if (quotesResponse.data && quotesResponse.data.quotations && quotesResponse.data.quotations.length > 0) {
      const quote = quotesResponse.data.quotations[0];

      // Get quote items
      const itemsResponse = await axios.get(`${BASE_URL}/api/quotations/${quote.id}/items`);

      if (itemsResponse.data && itemsResponse.data.length > 0) {
        const quoteItems = itemsResponse.data.map(item => ({
          productId: item.product_id,
          quantity: item.quantity
        }));

        const upsellData = {
          quoteItems,
          customerBudget: quote.total_cents * 1.2,
          currentTotal: quote.total_cents
        };

        const upsellResponse = await axios.post(`${BASE_URL}/api/ai/upsell-suggestions`, upsellData);

        if (upsellResponse.data.success) {
          console.log('   ✅ Upsell assistant working!');
          console.log(`   Current Quote: ${quoteItems.length} items, $${upsellResponse.data.currentQuote.total.toFixed(2)}`);
          console.log(`   Found ${upsellResponse.data.suggestions.length} upsell suggestions:`);

          upsellResponse.data.suggestions.slice(0, 3).forEach((sugg, i) => {
            console.log(`      ${i+1}. ${sugg.type.toUpperCase()}: ${sugg.product?.modelNumber || sugg.product?.name || 'N/A'}`);
            if (sugg.talking_points && sugg.talking_points.length > 0) {
              console.log(`         → ${sugg.talking_points[0]}`);
            }
          });

          console.log(`   Potential Additional Revenue: $${upsellResponse.data.impact.potentialAdditionalRevenue.toFixed(2)}`);
        } else {
          console.log('   ❌ Upsell assistant failed');
        }
      } else {
        console.log('   ⚠️  No quote items found to test upsell');
      }
    } else {
      console.log('   ⚠️  No quotations found to test upsell');
    }

    console.log('\n========================================');
    console.log('✅ AI FEATURES TEST COMPLETE');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testAIFeatures();
