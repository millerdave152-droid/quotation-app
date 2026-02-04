#!/usr/bin/env node
/**
 * Feature Flags Test Script
 * Verifies the AI kill switch and feature flag functionality
 *
 * Usage: node scripts/test-feature-flags.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const featureFlags = require('../services/ai/featureFlags');

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 AI FEATURE FLAGS TEST SUITE');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Helper function
  function test(name, condition) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  try {
    // ============================================================
    // TEST 1: Default state
    // ============================================================
    console.log('📋 Test 1: Default State');
    console.log('─'.repeat(40));

    featureFlags.clearCache();
    const defaultEnabled = await featureFlags.isEnabled();
    test('Default state should be enabled', defaultEnabled === true);

    const status1 = await featureFlags.getStatus();
    test('Effective source should be "default" or "environment"',
      ['default', 'environment'].includes(status1.effectiveSource));

    console.log();

    // ============================================================
    // TEST 2: Runtime override
    // ============================================================
    console.log('📋 Test 2: Runtime Override');
    console.log('─'.repeat(40));

    featureFlags.setRuntimeOverride(false);
    const afterDisable = await featureFlags.isEnabled();
    test('Should be disabled after runtime override', afterDisable === false);

    const status2 = await featureFlags.getStatus();
    test('Effective source should be "runtime"', status2.effectiveSource === 'runtime');
    test('Runtime override value should be false', status2.sources.runtimeOverride === false);

    featureFlags.setRuntimeOverride(true);
    const afterEnable = await featureFlags.isEnabled();
    test('Should be enabled after runtime override true', afterEnable === true);

    console.log();

    // ============================================================
    // TEST 3: Clear override
    // ============================================================
    console.log('📋 Test 3: Clear Override');
    console.log('─'.repeat(40));

    featureFlags.setRuntimeOverride(null);
    const status3 = await featureFlags.getStatus();
    test('Runtime override should be null after clear', status3.sources.runtimeOverride === null);
    test('Should fall back to default/env', status3.effectiveSource !== 'runtime');

    console.log();

    // ============================================================
    // TEST 4: Fallback response
    // ============================================================
    console.log('📋 Test 4: Fallback Response');
    console.log('─'.repeat(40));

    const fallback = featureFlags.getFallbackResponse();
    test('Fallback response has message', typeof fallback.message === 'string' && fallback.message.length > 50);
    test('Fallback response has isDisabled flag', fallback.isDisabled === true);
    test('Fallback response has FAQ reference', fallback.message.includes('FAQ'));
    test('Fallback response has contact info', fallback.message.includes('support'));

    console.log();

    // ============================================================
    // TEST 5: Status structure
    // ============================================================
    console.log('📋 Test 5: Status Object Structure');
    console.log('─'.repeat(40));

    const status5 = await featureFlags.getStatus();
    test('Status has enabled boolean', typeof status5.enabled === 'boolean');
    test('Status has sources object', typeof status5.sources === 'object');
    test('Status has effectiveSource string', typeof status5.effectiveSource === 'string');
    test('Sources has runtimeOverride', 'runtimeOverride' in status5.sources);
    test('Sources has database', 'database' in status5.sources);
    test('Sources has environment', 'environment' in status5.sources);
    test('Sources has default', 'default' in status5.sources);

    console.log();

    // ============================================================
    // TEST 6: Middleware function
    // ============================================================
    console.log('📋 Test 6: Middleware');
    console.log('─'.repeat(40));

    const middleware = featureFlags.checkEnabled();
    test('checkEnabled returns a function', typeof middleware === 'function');
    test('Middleware is async (returns function with 3 params)', middleware.length === 3);

    console.log();

    // ============================================================
    // CLEANUP
    // ============================================================
    featureFlags.clearCache();

  } catch (error) {
    console.error('❌ Test error:', error.message);
    failed++;
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total:  ${passed + failed}`);
  console.log();

  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
