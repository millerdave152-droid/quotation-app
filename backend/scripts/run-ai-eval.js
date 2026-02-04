#!/usr/bin/env node
/**
 * AI Evaluation Runner
 * Runs accuracy evaluation against the golden set of test cases
 *
 * Usage:
 *   node scripts/run-ai-eval.js [options]
 *
 * Options:
 *   --model <name>      Model to test (default: from router.js)
 *   --category <cat>    Only run cases in this category
 *   --difficulty <d>    Only run cases with this difficulty (easy/medium/hard)
 *   --limit <n>         Limit to n cases
 *   --verbose           Show detailed output for each case
 *   --dry-run           Show what would be run without executing
 *   --run-by <name>     Name/ID of person running eval (default: cli)
 */

require('dotenv').config();
const db = require('../config/database');
const aiService = require('../services/ai');
const { MODELS } = require('../services/ai/router');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // Scoring keywords - used for basic accuracy matching
  // In production, you'd want human review or a separate LLM judge
  ANSWER_KEYWORDS: {
    customer_lookup: ['customer', 'found', 'contact', 'phone', 'email', 'address'],
    product_search: ['product', 'price', 'stock', 'available', 'model', 'brand'],
    quote_status: ['quote', 'status', 'pending', 'accepted', 'expired', 'total'],
    email_draft: ['dear', 'hi', 'thank', 'sincerely', 'regards', 'subject'],
    policy: ['policy', 'return', 'warranty', 'days', 'refund', 'exchange'],
    cross_sell: ['recommend', 'suggest', 'accessory', 'also', 'pair', 'bundle'],
    general: ['help', 'assist', 'can', 'welcome']
  },
  TIMEOUT_MS: 60000
};

// ============================================================
// ARGUMENT PARSING
// ============================================================
function parseArgs() {
  const args = {
    model: null,
    category: null,
    difficulty: null,
    limit: null,
    verbose: false,
    dryRun: false,
    runBy: 'cli'
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    switch (arg) {
      case '--model':
        args.model = process.argv[++i];
        break;
      case '--category':
        args.category = process.argv[++i];
        break;
      case '--difficulty':
        args.difficulty = process.argv[++i];
        break;
      case '--limit':
        args.limit = parseInt(process.argv[++i]);
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--run-by':
        args.runBy = process.argv[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }

  return args;
}

function showHelp() {
  console.log(`
AI Evaluation Runner
====================

Usage: node scripts/run-ai-eval.js [options]

Options:
  --model <name>       Model to test (default: configured model)
  --category <cat>     Filter by category:
                       customer_lookup, product_search, quote_status,
                       email_draft, policy, cross_sell, general
  --difficulty <d>     Filter by difficulty: easy, medium, hard
  --limit <n>          Limit to first n cases
  --verbose            Show detailed output for each case
  --dry-run            Preview cases without running
  --run-by <name>      Evaluator name (default: cli)
  --help               Show this help message

Examples:
  # Run all cases
  node scripts/run-ai-eval.js

  # Run only product search cases
  node scripts/run-ai-eval.js --category product_search

  # Run easy cases with verbose output
  node scripts/run-ai-eval.js --difficulty easy --verbose

  # Preview what would run
  node scripts/run-ai-eval.js --dry-run
`);
}

// ============================================================
// SCORING FUNCTIONS
// ============================================================

/**
 * Score the answer based on expected keywords/content
 * Returns 1 if answer seems correct, 0 otherwise
 */
function scoreAnswer(response, evalCase) {
  if (!evalCase.has_answer_check) return null;

  const responseLower = response.toLowerCase();

  // Check for category-specific keywords
  const keywords = CONFIG.ANSWER_KEYWORDS[evalCase.category] || [];
  const keywordMatches = keywords.filter(kw => responseLower.includes(kw));

  // Check for expected answer content
  let expectedMatches = 0;
  if (evalCase.expected_answer) {
    const expectedWords = evalCase.expected_answer.toLowerCase().split(/[,\s]+/);
    expectedMatches = expectedWords.filter(w => w.length > 3 && responseLower.includes(w)).length;
  }

  // Scoring heuristic:
  // - At least 2 keyword matches OR
  // - At least 2 expected content matches
  // - AND response is not an error/apology
  const isError = responseLower.includes("i'm sorry") && responseLower.includes("cannot");
  const hasContent = keywordMatches.length >= 2 || expectedMatches >= 2;

  return (!isError && hasContent) ? 1 : 0;
}

/**
 * Score product accuracy
 * Returns 1 if correct products mentioned, 0 otherwise
 */
function scoreProduct(response, evalCase) {
  if (!evalCase.has_product_check) return null;

  const responseLower = response.toLowerCase();

  // Basic check: does it mention products/items?
  const productIndicators = [
    'product', 'item', 'model', 'sku', 'price', '$',
    'washer', 'dryer', 'refrigerator', 'fridge', 'dishwasher',
    'range', 'oven', 'microwave', 'freezer'
  ];

  const hasProductContent = productIndicators.some(ind => responseLower.includes(ind));

  // If specific product IDs expected, check for them
  if (evalCase.expected_product_ids && evalCase.expected_product_ids.length > 0) {
    const foundIds = evalCase.expected_product_ids.filter(id =>
      response.includes(id.toString())
    );
    return foundIds.length > 0 ? 1 : 0;
  }

  return hasProductContent ? 1 : 0;
}

/**
 * Score policy accuracy
 * Returns 1 if correct policy referenced, 0 otherwise
 */
function scorePolicy(response, evalCase) {
  if (!evalCase.has_policy_check) return null;

  const responseLower = response.toLowerCase();

  // Check if expected policy reference is mentioned
  if (evalCase.expected_policy_reference) {
    const policyTerms = evalCase.expected_policy_reference.toLowerCase().split('_');
    const hasPolicy = policyTerms.every(term => responseLower.includes(term));
    if (hasPolicy) return 1;
  }

  // General policy indicators
  const policyIndicators = [
    'policy', 'days', 'return', 'warranty', 'refund', 'exchange',
    'guarantee', 'terms', 'conditions', 'eligible', 'within'
  ];

  const hasPolicyContent = policyIndicators.filter(ind => responseLower.includes(ind)).length >= 2;

  return hasPolicyContent ? 1 : 0;
}

// ============================================================
// MAIN EVALUATION LOGIC
// ============================================================

async function runEvaluation(args) {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 AI ACCURACY EVALUATION');
  console.log('='.repeat(60) + '\n');

  // Get model name
  const modelName = args.model || MODELS.HAIKU;
  console.log(`📋 Model: ${modelName}`);

  // Build query for cases
  let query = 'SELECT * FROM ai_eval_cases WHERE is_active = true';
  const params = [];
  let paramIndex = 1;

  if (args.category) {
    query += ` AND category = $${paramIndex++}`;
    params.push(args.category);
    console.log(`📁 Category: ${args.category}`);
  }

  if (args.difficulty) {
    query += ` AND difficulty = $${paramIndex++}`;
    params.push(args.difficulty);
    console.log(`📊 Difficulty: ${args.difficulty}`);
  }

  query += ' ORDER BY case_id';

  if (args.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(args.limit);
    console.log(`🔢 Limit: ${args.limit}`);
  }

  // Fetch cases
  const casesResult = await db.query(query, params);
  const cases = casesResult.rows;

  console.log(`\n📝 Found ${cases.length} evaluation cases\n`);

  if (cases.length === 0) {
    console.log('⚠️  No cases found. Run seed-eval-cases.js first.');
    process.exit(1);
  }

  // Dry run - just show cases
  if (args.dryRun) {
    console.log('DRY RUN - Cases that would be evaluated:\n');
    console.log('─'.repeat(60));
    for (const c of cases) {
      console.log(`${c.case_id.padEnd(12)} [${c.difficulty.padEnd(6)}] ${c.category}`);
      console.log(`  └─ ${c.prompt.substring(0, 50)}...`);
    }
    console.log('─'.repeat(60));
    process.exit(0);
  }

  // Create evaluation run
  const runResult = await db.query(
    `INSERT INTO ai_eval_runs (model_name, run_type, total_cases, run_by)
     VALUES ($1, 'manual', $2, $3)
     RETURNING run_id`,
    [modelName, cases.length, args.runBy]
  );
  const runId = runResult.rows[0].run_id;
  console.log(`🆔 Run ID: ${runId}\n`);
  console.log('─'.repeat(60));

  // Tracking variables
  const results = {
    passed: 0,
    failed: 0,
    errors: 0,
    answerTotal: 0,
    answerPassed: 0,
    productTotal: 0,
    productPassed: 0,
    policyTotal: 0,
    policyPassed: 0,
    totalTimeMs: 0,
    totalTokens: 0,
    totalCost: 0
  };

  // Process each case
  for (let i = 0; i < cases.length; i++) {
    const evalCase = cases[i];
    const progress = `[${(i + 1).toString().padStart(3)}/${cases.length}]`;

    process.stdout.write(`${progress} ${evalCase.case_id.padEnd(12)} `);

    try {
      // Create a temporary conversation for this evaluation
      const convResult = await db.query(
        `INSERT INTO ai_conversations (user_id, title)
         VALUES (1, $1)
         RETURNING id`,
        [`eval-${runId}-${evalCase.case_id}`]
      );
      const conversationId = convResult.rows[0].id;

      // Run the AI query
      const startTime = Date.now();
      const response = await aiService.handleChat({
        conversationId,
        userMessage: evalCase.prompt,
        userId: 1,
        locationId: null
      });
      const responseTimeMs = Date.now() - startTime;

      // Score the response
      const answerScore = scoreAnswer(response.message, evalCase);
      const productScore = scoreProduct(response.message, evalCase);
      const policyScore = scorePolicy(response.message, evalCase);

      // Calculate totals
      let maxScore = 0;
      let totalScore = 0;

      if (answerScore !== null) {
        maxScore++;
        totalScore += answerScore;
        results.answerTotal++;
        results.answerPassed += answerScore;
      }
      if (productScore !== null) {
        maxScore++;
        totalScore += productScore;
        results.productTotal++;
        results.productPassed += productScore;
      }
      if (policyScore !== null) {
        maxScore++;
        totalScore += policyScore;
        results.policyTotal++;
        results.policyPassed += policyScore;
      }

      const passed = totalScore === maxScore;
      if (passed) results.passed++;
      else results.failed++;

      results.totalTimeMs += responseTimeMs;
      results.totalTokens += (response.tokenUsage?.input_tokens || 0) + (response.tokenUsage?.output_tokens || 0);

      // Store result
      await db.query(
        `INSERT INTO ai_eval_results
         (run_id, case_id, model_response, response_time_ms, tokens_used,
          answer_correct, product_correct, policy_correct, max_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          runId,
          evalCase.case_id,
          response.message,
          responseTimeMs,
          (response.tokenUsage?.input_tokens || 0) + (response.tokenUsage?.output_tokens || 0),
          answerScore || 0,
          productScore || 0,
          policyScore || 0,
          maxScore
        ]
      );

      // Print result
      const statusIcon = passed ? '✅' : '❌';
      const scoreStr = `${totalScore}/${maxScore}`;
      console.log(`${statusIcon} ${scoreStr.padEnd(5)} ${responseTimeMs}ms`);

      // Verbose output
      if (args.verbose) {
        console.log(`     Prompt: ${evalCase.prompt.substring(0, 50)}...`);
        console.log(`     Response: ${response.message.substring(0, 100)}...`);
        console.log(`     Scores: answer=${answerScore} product=${productScore} policy=${policyScore}`);
        console.log();
      }

      // Cleanup eval conversation
      await db.query('DELETE FROM ai_conversations WHERE id = $1', [conversationId]);

    } catch (error) {
      results.errors++;
      console.log(`💥 ERROR: ${error.message.substring(0, 40)}...`);

      // Store error result
      await db.query(
        `INSERT INTO ai_eval_results
         (run_id, case_id, had_error, error_message)
         VALUES ($1, $2, true, $3)`,
        [runId, evalCase.case_id, error.message]
      );
    }
  }

  // Calculate final metrics
  const totalCases = results.passed + results.failed + results.errors;
  const overallAccuracy = totalCases > 0 ? (results.passed / totalCases * 100) : 0;
  const answerAccuracy = results.answerTotal > 0 ? (results.answerPassed / results.answerTotal * 100) : null;
  const productAccuracy = results.productTotal > 0 ? (results.productPassed / results.productTotal * 100) : null;
  const policyAccuracy = results.policyTotal > 0 ? (results.policyPassed / results.policyTotal * 100) : null;
  const avgResponseTime = totalCases > 0 ? Math.round(results.totalTimeMs / totalCases) : 0;

  // Update run record
  await db.query(
    `UPDATE ai_eval_runs SET
       passed_cases = $1,
       failed_cases = $2,
       answer_score_total = $3,
       answer_score_passed = $4,
       product_score_total = $5,
       product_score_passed = $6,
       policy_score_total = $7,
       policy_score_passed = $8,
       overall_accuracy = $9,
       answer_accuracy = $10,
       product_accuracy = $11,
       policy_accuracy = $12,
       avg_response_time_ms = $13,
       total_tokens_used = $14,
       completed_at = CURRENT_TIMESTAMP
     WHERE run_id = $15`,
    [
      results.passed,
      results.failed + results.errors,
      results.answerTotal,
      results.answerPassed,
      results.productTotal,
      results.productPassed,
      results.policyTotal,
      results.policyPassed,
      overallAccuracy.toFixed(2),
      answerAccuracy?.toFixed(2) || null,
      productAccuracy?.toFixed(2) || null,
      policyAccuracy?.toFixed(2) || null,
      avgResponseTime,
      results.totalTokens,
      runId
    ]
  );

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 EVALUATION SUMMARY');
  console.log('='.repeat(60));
  console.log();
  console.log(`   Model:           ${modelName}`);
  console.log(`   Run ID:          ${runId}`);
  console.log(`   Total Cases:     ${totalCases}`);
  console.log();
  console.log('   RESULTS:');
  console.log('   ─'.repeat(25));
  console.log(`   ✅ Passed:        ${results.passed}`);
  console.log(`   ❌ Failed:        ${results.failed}`);
  console.log(`   💥 Errors:        ${results.errors}`);
  console.log();
  console.log('   ACCURACY SCORES:');
  console.log('   ─'.repeat(25));
  console.log(`   📈 Overall:       ${overallAccuracy.toFixed(1)}%`);
  if (answerAccuracy !== null) console.log(`   📝 Answer:        ${answerAccuracy.toFixed(1)}% (${results.answerPassed}/${results.answerTotal})`);
  if (productAccuracy !== null) console.log(`   📦 Product:       ${productAccuracy.toFixed(1)}% (${results.productPassed}/${results.productTotal})`);
  if (policyAccuracy !== null) console.log(`   📋 Policy:        ${policyAccuracy.toFixed(1)}% (${results.policyPassed}/${results.policyTotal})`);
  console.log();
  console.log('   PERFORMANCE:');
  console.log('   ─'.repeat(25));
  console.log(`   ⏱️  Avg Response:  ${avgResponseTime}ms`);
  console.log(`   🔤 Total Tokens:  ${results.totalTokens.toLocaleString()}`);
  console.log();
  console.log('='.repeat(60));
  console.log();

  // Exit with appropriate code
  process.exit(results.errors > 0 || overallAccuracy < 50 ? 1 : 0);
}

// ============================================================
// ENTRY POINT
// ============================================================
const args = parseArgs();
runEvaluation(args).catch(err => {
  console.error('❌ Evaluation failed:', err);
  process.exit(1);
});
