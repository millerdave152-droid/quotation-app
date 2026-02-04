#!/usr/bin/env node
/**
 * AI Assistant Load Test
 * Lightweight performance testing for the AI chat endpoint
 *
 * Usage:
 *   node scripts/load-test.js [profile] [options]
 *
 * Profiles: smoke, light, medium, stress
 *
 * Options:
 *   --token <token>     Auth token (or set AI_LOAD_TEST_TOKEN env var)
 *   --base-url <url>    Override base URL
 *   --json              Output results as JSON
 *   --ci                CI mode (exit code based on pass/fail)
 *   --help              Show help
 *
 * Examples:
 *   node scripts/load-test.js smoke --token abc123
 *   node scripts/load-test.js medium --ci
 *   AI_LOAD_TEST_TOKEN=abc123 node scripts/load-test.js light
 */

const http = require('http');
const https = require('https');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG_PATH = path.join(__dirname, 'load-test-config.json');
let config;

try {
  config = require(CONFIG_PATH);
} catch (e) {
  console.error('Failed to load config:', e.message);
  process.exit(1);
}

// ============================================================
// ARGUMENT PARSING
// ============================================================
function parseArgs() {
  const args = {
    profile: 'smoke',
    token: process.env.AI_LOAD_TEST_TOKEN || null,
    baseUrl: config.endpoints.base_url,
    json: false,
    ci: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--token') {
      args.token = process.argv[++i];
    } else if (arg === '--base-url') {
      args.baseUrl = process.argv[++i];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--ci') {
      args.ci = true;
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      args.profile = arg;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
AI Assistant Load Test
======================

Usage: node scripts/load-test.js [profile] [options]

Profiles:
  smoke    Quick smoke test (1 user, 3 requests)
  light    Light load (3 users, 5 requests each)
  medium   Medium load (5 users, 10 requests each)
  stress   Stress test (10 users, 10 requests each)

Options:
  --token <token>     Auth token for API calls
  --base-url <url>    Override base URL (default: ${config.endpoints.base_url})
  --json              Output results as JSON
  --ci                CI mode (exit 1 if targets not met)
  --help              Show this help

Environment Variables:
  AI_LOAD_TEST_TOKEN  Auth token (alternative to --token)

Performance Targets:
  p95 Latency:   < ${config.targets.p95_latency_ms}ms
  p99 Latency:   < ${config.targets.p99_latency_ms}ms
  Error Rate:    < ${config.targets.error_rate_percent}%

Examples:
  node scripts/load-test.js smoke --token abc123
  node scripts/load-test.js medium --ci
  AI_LOAD_TEST_TOKEN=abc123 node scripts/load-test.js light --json
`);
}

// ============================================================
// HTTP CLIENT
// ============================================================
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;

    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 60000
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          latency,
          data: data,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('error', (err) => {
      const latency = Date.now() - startTime;
      resolve({
        status: 0,
        latency,
        error: err.message,
        success: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const latency = Date.now() - startTime;
      resolve({
        status: 0,
        latency,
        error: 'Request timeout',
        success: false
      });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ============================================================
// STATISTICS
// ============================================================
function calculateStats(latencies) {
  if (latencies.length === 0) return null;

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

// ============================================================
// VIRTUAL USER
// ============================================================
async function runVirtualUser(userId, profile, baseUrl, token, prompts) {
  const results = [];
  const chatUrl = `${baseUrl}${config.endpoints.chat_path}`;

  for (let i = 0; i < profile.requests_per_user; i++) {
    // Select a random prompt
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    const result = await makeRequest(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, JSON.stringify({
      message: prompt,
      conversationId: null
    }));

    results.push({
      userId,
      requestNum: i + 1,
      prompt: prompt.substring(0, 30) + '...',
      ...result
    });

    // Think time between requests
    if (i < profile.requests_per_user - 1 && profile.think_time_ms > 0) {
      await new Promise(r => setTimeout(r, profile.think_time_ms));
    }
  }

  return results;
}

// ============================================================
// MAIN LOAD TEST
// ============================================================
async function runLoadTest(args) {
  const profile = config.test_profiles[args.profile];

  if (!profile) {
    console.error(`Unknown profile: ${args.profile}`);
    console.error(`Available profiles: ${Object.keys(config.test_profiles).join(', ')}`);
    process.exit(1);
  }

  if (!args.token) {
    console.error('Error: Auth token required. Use --token or set AI_LOAD_TEST_TOKEN');
    process.exit(1);
  }

  // Print header
  if (!args.json) {
    console.log('\n' + '='.repeat(60));
    console.log('🔥 AI ASSISTANT LOAD TEST');
    console.log('='.repeat(60));
    console.log();
    console.log(`📋 Profile:     ${args.profile} - ${profile.description}`);
    console.log(`👥 Users:       ${profile.concurrent_users}`);
    console.log(`📨 Requests:    ${profile.requests_per_user} per user`);
    console.log(`⏱️  Think Time:  ${profile.think_time_ms}ms`);
    console.log(`🎯 Target:      p95 < ${config.targets.p95_latency_ms}ms, errors < ${config.targets.error_rate_percent}%`);
    console.log();
  }

  // Health check first
  if (!args.json) {
    process.stdout.write('🏥 Health check... ');
  }

  const healthUrl = `${args.baseUrl}${config.endpoints.health_path}`;
  const healthCheck = await makeRequest(healthUrl, { method: 'GET' });

  if (!healthCheck.success) {
    if (!args.json) {
      console.log('❌ FAILED');
      console.log(`   Server not reachable at ${args.baseUrl}`);
    }
    process.exit(1);
  }

  if (!args.json) {
    console.log('✅ OK');
    console.log();
  }

  // Ramp-up phase
  const startTime = Date.now();
  const allResults = [];
  const userPromises = [];

  if (!args.json) {
    console.log('🚀 Starting load test...');
    console.log('─'.repeat(60));
  }

  // Start virtual users with ramp-up
  const rampUpDelay = profile.ramp_up_seconds > 0
    ? (profile.ramp_up_seconds * 1000) / profile.concurrent_users
    : 0;

  for (let u = 0; u < profile.concurrent_users; u++) {
    // Stagger user starts
    if (rampUpDelay > 0 && u > 0) {
      await new Promise(r => setTimeout(r, rampUpDelay));
    }

    if (!args.json) {
      console.log(`   👤 User ${u + 1} started`);
    }

    userPromises.push(
      runVirtualUser(u + 1, profile, args.baseUrl, args.token, config.test_prompts)
    );
  }

  // Wait for all users to complete
  const userResults = await Promise.all(userPromises);
  userResults.forEach(results => allResults.push(...results));

  const totalDuration = Date.now() - startTime;

  // Calculate statistics
  const successfulLatencies = allResults.filter(r => r.success).map(r => r.latency);
  const failedRequests = allResults.filter(r => !r.success);
  const stats = calculateStats(successfulLatencies);

  const totalRequests = allResults.length;
  const errorRate = (failedRequests.length / totalRequests) * 100;
  const throughput = totalRequests / (totalDuration / 1000);

  // Evaluate against targets
  const p95Pass = stats ? stats.p95 <= config.targets.p95_latency_ms : false;
  const p99Pass = stats ? stats.p99 <= config.targets.p99_latency_ms : false;
  const errorPass = errorRate <= config.targets.error_rate_percent;
  const allPass = p95Pass && errorPass;

  // Build results object
  const results = {
    timestamp: new Date().toISOString(),
    profile: args.profile,
    profileConfig: profile,
    targets: config.targets,
    summary: {
      totalRequests,
      successfulRequests: totalRequests - failedRequests.length,
      failedRequests: failedRequests.length,
      errorRate: Math.round(errorRate * 100) / 100,
      durationMs: totalDuration,
      throughputRps: Math.round(throughput * 100) / 100
    },
    latency: stats || {},
    evaluation: {
      p95Pass,
      p99Pass,
      errorPass,
      allPass
    },
    errors: failedRequests.map(r => ({
      userId: r.userId,
      error: r.error || `HTTP ${r.status}`
    }))
  };

  // Output results
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log();
    console.log('='.repeat(60));
    console.log('📊 RESULTS');
    console.log('='.repeat(60));
    console.log();

    console.log('   REQUESTS:');
    console.log('   ─'.repeat(25));
    console.log(`   Total:        ${totalRequests}`);
    console.log(`   Successful:   ${totalRequests - failedRequests.length}`);
    console.log(`   Failed:       ${failedRequests.length}`);
    console.log(`   Error Rate:   ${errorRate.toFixed(2)}% ${errorPass ? '✅' : '❌'} (target: <${config.targets.error_rate_percent}%)`);
    console.log();

    if (stats) {
      console.log('   LATENCY:');
      console.log('   ─'.repeat(25));
      console.log(`   Min:          ${stats.min}ms`);
      console.log(`   Avg:          ${stats.avg}ms`);
      console.log(`   Max:          ${stats.max}ms`);
      console.log(`   p50:          ${stats.p50}ms`);
      console.log(`   p75:          ${stats.p75}ms`);
      console.log(`   p90:          ${stats.p90}ms`);
      console.log(`   p95:          ${stats.p95}ms ${p95Pass ? '✅' : '❌'} (target: <${config.targets.p95_latency_ms}ms)`);
      console.log(`   p99:          ${stats.p99}ms ${p99Pass ? '✅' : '❌'} (target: <${config.targets.p99_latency_ms}ms)`);
      console.log();
    }

    console.log('   THROUGHPUT:');
    console.log('   ─'.repeat(25));
    console.log(`   Duration:     ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`   Requests/sec: ${throughput.toFixed(2)}`);
    console.log();

    if (failedRequests.length > 0 && failedRequests.length <= 10) {
      console.log('   ERRORS:');
      console.log('   ─'.repeat(25));
      failedRequests.forEach(r => {
        console.log(`   User ${r.userId}: ${r.error || `HTTP ${r.status}`}`);
      });
      console.log();
    }

    console.log('='.repeat(60));
    if (allPass) {
      console.log('✅ PASS - All performance targets met');
    } else {
      console.log('❌ FAIL - Performance targets not met');
      if (!p95Pass) console.log(`   • p95 latency ${stats?.p95}ms exceeds ${config.targets.p95_latency_ms}ms`);
      if (!errorPass) console.log(`   • Error rate ${errorRate.toFixed(2)}% exceeds ${config.targets.error_rate_percent}%`);
    }
    console.log('='.repeat(60));
    console.log();
  }

  // Exit code for CI
  if (args.ci) {
    process.exit(allPass ? 0 : 1);
  }
}

// ============================================================
// ENTRY POINT
// ============================================================
const args = parseArgs();
runLoadTest(args).catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
