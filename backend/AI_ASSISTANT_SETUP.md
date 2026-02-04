# AI Assistant Setup Guide

TeleTime Solutions Customer Support AI Assistant - 4-Week Pilot

## Prerequisites

- PostgreSQL 16.8 (confirmed compatible)
- pgvector extension available
- Anthropic API key

---

## Step 1: Install Backend Dependencies

```bash
cd backend
npm install @anthropic-ai/sdk
```

## Step 2: Add Environment Variables

Add these to your `.env` file:

```env
# AI Assistant Configuration
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Optional: OpenAI for embeddings (future use)
# OPENAI_API_KEY=sk-your-openai-key-here
```

## Step 3: Run Database Migration

```bash
cd backend
node scripts/run-ai-migration.js
```

This will:
- Enable pgvector extension
- Create embedding tables (product_embeddings, customer_embeddings)
- Create conversation tables (ai_conversations, ai_messages)
- Create analytics tables (ai_query_logs)
- Set up helper functions and views

## Step 4: Register AI Routes

Add to `backend/server.js` (find the routes section):

```javascript
// AI Assistant routes
const aiAssistantRoutes = require('./routes/ai-assistant');
app.use('/api/ai', aiAssistantRoutes);
console.log('✅ AI Assistant routes loaded');
```

## Step 5: Restart Backend

```bash
# Stop current server and restart
node server.js
```

## Step 6: Verify Installation

Test the health endpoint:
```bash
curl http://localhost:3001/api/ai/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "apiKeyConfigured": true,
    "database": "connected"
  }
}
```

---

## Frontend Setup

### Step 1: Install Dependencies

```bash
cd frontend
npm install react-markdown
```

### Step 2: Import the Component

In your main App.jsx or layout component:

```jsx
import AIAssistant from './components/AIAssistant';

function App() {
  return (
    <div>
      {/* Your existing app content */}

      {/* Add the AI Assistant - renders as floating chat button */}
      <AIAssistant />
    </div>
  );
}
```

### Step 3: Restart Frontend

```bash
npm start
```

---

## Testing the Assistant

1. Open your app in browser
2. Click the chat bubble icon (bottom right)
3. Try these test queries:

**Customer Lookup:**
- "Find customer John Smith"
- "Look up customer 416-555-1234"
- "Who is customer #42?"

**Product Search:**
- "Show me Samsung refrigerators"
- "What washers do we have in stock?"
- "Price for model WF45R6100AW"

**Quote Status:**
- "Status of quote Q-2024-001234"
- "Show quotes for customer #42"

**Email Draft:**
- "Draft a follow-up email for customer John Smith about his pending quote"

**Cross-Sell:**
- "What accessories go with this washer?"
- "Suggest add-ons for customer #42's cart"

---

## Monitoring the Pilot

### View Daily Stats

```sql
SELECT * FROM ai_daily_stats ORDER BY date DESC LIMIT 7;
```

### View Pilot Dashboard

```sql
SELECT * FROM ai_pilot_dashboard;
```

### Check Model Distribution

```sql
SELECT * FROM ai_model_stats WHERE date >= CURRENT_DATE - 7 ORDER BY date DESC;
```

### Review Low-Rated Responses

```sql
SELECT
  q.query_text,
  q.routed_to_model,
  q.user_feedback,
  q.feedback_notes,
  q.created_at
FROM ai_query_logs q
WHERE q.user_feedback IN ('not_helpful', 'incorrect')
ORDER BY q.created_at DESC
LIMIT 20;
```

---

## Cost Tracking

### Current Period Costs

```sql
SELECT
  SUM(estimated_cost_usd) as total_cost,
  COUNT(*) as total_queries,
  AVG(estimated_cost_usd) as avg_cost_per_query
FROM ai_query_logs
WHERE created_at >= CURRENT_DATE - 7;
```

### Cost by Model

```sql
SELECT
  routed_to_model,
  COUNT(*) as queries,
  SUM(estimated_cost_usd) as total_cost,
  AVG(estimated_cost_usd) as avg_cost
FROM ai_query_logs
WHERE created_at >= CURRENT_DATE - 7
GROUP BY routed_to_model;
```

---

## Troubleshooting

### "API key not configured" error

1. Check `.env` file has `ANTHROPIC_API_KEY`
2. Restart the backend server
3. Verify with `/api/ai/health` endpoint

### "pgvector extension failed"

1. Connect as RDS admin user
2. Run: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Re-run migration

### Slow responses (>3 seconds)

1. Check if Sonnet is being triggered unnecessarily
2. Review routing reasons in `ai_query_logs`
3. Consider adjusting routing thresholds

### High costs

1. Check model distribution in analytics
2. Review which queries trigger Sonnet
3. Adjust VIP threshold or routing rules

---

## Pilot Instrumentation

The AI Assistant includes comprehensive instrumentation for monitoring pilot performance.

### Structured Logging

All AI requests emit structured JSON logs for easy parsing:

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "INFO",
  "service": "ai-assistant",
  "event": "ai_request_complete",
  "conversationId": "uuid",
  "responseTimeMs": 1234,
  "inputTokens": 500,
  "outputTokens": 200,
  "costUsd": 0.0025,
  "toolsUsed": ["search_customers", "search_products"]
}
```

Log events include:
- `ai_request_start` - Request initiated
- `ai_request_complete` - Request succeeded
- `ai_request_error` - Request failed
- `ai_tool_execution` - Tool was called
- `ai_model_routing` - Model selection decision
- `ai_feedback_submitted` - User provided feedback
- `ai_rate_limit` - Rate limit encountered

### Analytics Views (PostgreSQL)

| View | Description |
|------|-------------|
| `ai_hourly_stats` | Hourly breakdown for last 48 hours |
| `ai_recent_errors` | Last 100 error details |
| `ai_feedback_summary` | Feedback by day and query type |
| `ai_realtime_metrics` | Current state (last hour, today) |
| `ai_latency_percentiles` | P50/P75/P90/P95/P99 by day |
| `ai_pilot_dashboard` | Overall pilot summary |
| `ai_daily_stats` | Daily aggregates |

### Real-Time Monitoring

```bash
# Check real-time metrics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/ai/analytics/realtime

# Response:
{
  "success": true,
  "data": {
    "queries_last_hour": 42,
    "avg_latency_last_hour_ms": 1250,
    "errors_last_hour": 1,
    "queries_today": 312,
    "cost_today_usd": 0.78,
    "error_rate_24h_percent": 0.32,
    "feedback_rate_7d_percent": 15.2
  }
}
```

### Latency Percentiles

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/ai/analytics/latency?days=7"

# Response includes P50, P75, P90, P95, P99 latencies by day
```

### Error Tracking

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/ai/analytics/errors?limit=20"

# Returns recent errors with query preview, model, error type
```

---

## File Structure

```
backend/
├── services/ai/
│   ├── index.js          # Main orchestrator
│   ├── router.js         # Model routing logic
│   ├── tools.js          # Tool definitions
│   ├── context.js        # RAG context assembly
│   ├── logger.js         # Structured logging
│   ├── featureFlags.js   # Kill switch & feature flags
│   └── prompts/
│       └── system.js     # Prompt templates
├── routes/
│   └── ai-assistant.js   # API endpoints
├── migrations/
│   ├── 001_ai_assistant_schema.sql
│   ├── 096_ai_pilot_instrumentation.sql
│   └── 097_ai_evaluation_tables.sql
└── scripts/
    ├── run-ai-migration.js
    ├── seed-eval-cases.js     # Seed golden set
    ├── run-ai-eval.js         # Evaluation CLI
    ├── test-feature-flags.js  # Feature flag tests
    ├── load-test.js           # Load testing CLI
    └── load-test-config.json  # Performance targets

frontend/
└── src/components/AIAssistant/
    ├── AIAssistant.jsx   # Chat component
    └── index.js          # Export
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Send message, get response |
| `/api/ai/conversations` | GET | List conversations |
| `/api/ai/conversations` | POST | Create new conversation |
| `/api/ai/conversations/:id` | GET | Get conversation |
| `/api/ai/conversations/:id` | DELETE | Archive conversation |
| `/api/ai/feedback` | POST | Submit feedback |
| `/api/ai/analytics/usage` | GET | Usage analytics (admin/manager) |
| `/api/ai/analytics/pilot` | GET | Pilot dashboard (admin/manager) |
| `/api/ai/analytics/realtime` | GET | Real-time metrics (admin/manager) |
| `/api/ai/analytics/hourly` | GET | Hourly stats for 48h (admin/manager) |
| `/api/ai/analytics/errors` | GET | Recent error logs (admin/manager) |
| `/api/ai/analytics/latency` | GET | Latency percentiles (admin/manager) |
| `/api/ai/analytics/feedback` | GET | Feedback summary (admin/manager) |
| `/api/ai/admin/status` | GET | Feature flag status (admin) |
| `/api/ai/admin/toggle` | POST | Enable/disable AI (admin) |
| `/api/ai/admin/kill-switch` | POST | Emergency shutoff (admin) |
| `/api/ai/admin/clear-override` | POST | Clear runtime override (admin) |
| `/api/ai/health` | GET | Health check (public) |

---

## Feature Flags & Kill Switch

The AI Assistant includes a feature flag system for runtime control and emergency shutoff.

### Configuration Hierarchy

Settings are checked in this order (first match wins):
1. **Runtime Override** - In-memory, set via admin API (lost on restart)
2. **Database Setting** - Persistent, stored in `system_settings` table
3. **Environment Variable** - `AI_ASSISTANT_ENABLED` in `.env`
4. **Default** - Enabled (true)

### Environment Variable

Add to `.env`:
```env
# AI Kill Switch (true/false)
AI_ASSISTANT_ENABLED=true
```

### Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/admin/status` | GET | Get current feature flag status |
| `/api/ai/admin/toggle` | POST | Enable/disable AI |
| `/api/ai/admin/kill-switch` | POST | Emergency shutoff |
| `/api/ai/admin/clear-override` | POST | Clear runtime override |

### Using the Kill Switch

**Check Status:**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/api/ai/admin/status
```

**Disable AI (runtime only - reverts on restart):**
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "persist": false}' \
  http://localhost:3001/api/ai/admin/toggle
```

**Disable AI (persistent - survives restart):**
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "persist": true}' \
  http://localhost:3001/api/ai/admin/toggle
```

**Emergency Kill Switch:**
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "High error rate detected"}' \
  http://localhost:3001/api/ai/admin/kill-switch
```

**Re-enable after kill switch:**
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "persist": true}' \
  http://localhost:3001/api/ai/admin/toggle
```

### Fallback Response

When AI is disabled, users see:
```
I'm currently unavailable for assistance. In the meantime, you can:

• Check our FAQ: Common questions about orders, returns, and products
• Contact Support: Call 1-800-555-0123 or email support@teletime.ca
• View Help Center: Visit our online help center for guides and tutorials

I'll be back online soon. Thank you for your patience!
```

### Health Check

The `/api/ai/health` endpoint now includes feature flag status:
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "apiKeyConfigured": true,
    "aiEnabled": true,
    "enabledSource": "default",
    "database": "connected"
  }
}
```

Status values:
- `operational` - AI is fully working
- `degraded` - API key missing
- `disabled` - Kill switch active

---

## Accuracy Evaluation

The AI Assistant includes a golden set evaluation system for measuring accuracy.

### Golden Set Overview

90 test cases across 7 categories:
- `customer_lookup` (15 cases) - Finding customers by name, phone, ID
- `product_search` (20 cases) - Product queries, filters, comparisons
- `quote_status` (10 cases) - Quote lookups and status checks
- `email_draft` (10 cases) - Email composition requests
- `policy` (15 cases) - Policy and procedure questions
- `cross_sell` (10 cases) - Upsell and recommendation requests
- `general` (10 cases) - Greetings, capabilities, misc

### Scoring Rubric

Each case is scored on applicable dimensions (0 or 1 each):

| Dimension | Description | Score |
|-----------|-------------|-------|
| **Answer** | Response addresses the query correctly | 0/1 |
| **Product** | Correct products mentioned (if applicable) | 0/1 |
| **Policy** | Correct policy referenced (if applicable) | 0/1 |

Overall accuracy = cases where all applicable scores = 1

### Running Evaluations

```bash
cd backend

# Run full evaluation
node scripts/run-ai-eval.js

# Run specific category
node scripts/run-ai-eval.js --category product_search

# Run with verbose output
node scripts/run-ai-eval.js --verbose

# Dry run (preview cases)
node scripts/run-ai-eval.js --dry-run

# Filter by difficulty
node scripts/run-ai-eval.js --difficulty easy

# Limit number of cases
node scripts/run-ai-eval.js --limit 10
```

### Evaluation Output

```
============================================================
📊 EVALUATION SUMMARY
============================================================

   Model:           claude-sonnet-4-20250514
   Run ID:          abc123-def456-...
   Total Cases:     90

   RESULTS:
   ──────────────────────────
   ✅ Passed:        78
   ❌ Failed:        10
   💥 Errors:        2

   ACCURACY SCORES:
   ──────────────────────────
   📈 Overall:       86.7%
   📝 Answer:        88.9% (80/90)
   📦 Product:       82.5% (33/40)
   📋 Policy:        90.0% (27/30)

   PERFORMANCE:
   ──────────────────────────
   ⏱️  Avg Response:  1250ms
   🔤 Total Tokens:  45,230
```

### Viewing Results

```sql
-- Recent evaluation runs
SELECT * FROM ai_eval_summary LIMIT 10;

-- Weekly accuracy trend
SELECT * FROM ai_eval_weekly_comparison;

-- Failed cases in last run
SELECT r.case_id, c.prompt, r.answer_correct, r.product_correct, r.policy_correct
FROM ai_eval_results r
JOIN ai_eval_cases c ON r.case_id = c.case_id
WHERE r.run_id = (SELECT run_id FROM ai_eval_runs ORDER BY started_at DESC LIMIT 1)
  AND (r.answer_correct = 0 OR r.product_correct = 0 OR r.policy_correct = 0);
```

### Adding New Cases

Edit `scripts/seed-eval-cases.js` to add new test cases:

```javascript
{
  case_id: 'PROD-021',
  category: 'product_search',
  difficulty: 'medium',
  prompt: 'Your test prompt here',
  expected_answer: 'keywords expected in response',
  has_answer_check: true,
  has_product_check: true,
  has_policy_check: false,
  source: 'manual',
  notes: 'Description of what this tests'
}
```

Then re-seed with `--force`:
```bash
node scripts/seed-eval-cases.js --force
```

### Weekly Audit Schedule

Recommended weekly evaluation process:
1. **Monday**: Run full evaluation
2. **Review**: Check failed cases, identify patterns
3. **Tune**: Adjust prompts or routing if needed
4. **Track**: Compare to previous week's results

---

## Load Testing & Performance Budgets

The AI Assistant includes a lightweight load testing tool for performance validation.

### Performance Targets

| Metric | Target | Description |
|--------|--------|-------------|
| p95 Latency | < 3000ms | 95th percentile response time |
| p99 Latency | < 5000ms | 99th percentile response time |
| Error Rate | < 2% | Failed requests percentage |

### Test Profiles

| Profile | Users | Requests/User | Description |
|---------|-------|---------------|-------------|
| `smoke` | 1 | 3 | Quick validation |
| `light` | 3 | 5 | Typical usage |
| `medium` | 5 | 10 | Busy period |
| `stress` | 10 | 10 | Peak load |

### Running Load Tests Locally

```bash
cd backend

# Get an auth token first (login as test user)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data?.token||JSON.parse(d).token))")

# Run smoke test
node scripts/load-test.js smoke --token $TOKEN

# Run light load test
node scripts/load-test.js light --token $TOKEN

# Run with verbose JSON output
node scripts/load-test.js smoke --token $TOKEN --json
```

### Running in CI

```yaml
# .github/workflows/load-test.yml
name: AI Load Test

on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd backend && npm ci

      - name: Run load test
        env:
          AI_LOAD_TEST_TOKEN: ${{ secrets.AI_LOAD_TEST_TOKEN }}
        run: |
          cd backend
          node scripts/load-test.js light --ci
```

### Sample Output

```
============================================================
🔥 AI ASSISTANT LOAD TEST
============================================================

📋 Profile:     light - Light load - typical usage
👥 Users:       3
📨 Requests:    5 per user
⏱️  Think Time:  2000ms
🎯 Target:      p95 < 3000ms, errors < 2%

🏥 Health check... ✅ OK

🚀 Starting load test...
────────────────────────────────────────────────────────────
   👤 User 1 started
   👤 User 2 started
   👤 User 3 started

============================================================
📊 RESULTS
============================================================

   REQUESTS:
   ──────────────────────────
   Total:        15
   Successful:   15
   Failed:       0
   Error Rate:   0.00% ✅ (target: <2%)

   LATENCY:
   ──────────────────────────
   Min:          1123ms
   Avg:          1845ms
   Max:          2890ms
   p50:          1756ms
   p75:          2100ms
   p90:          2456ms
   p95:          2678ms ✅ (target: <3000ms)
   p99:          2890ms ✅ (target: <5000ms)

   THROUGHPUT:
   ──────────────────────────
   Duration:     32.5s
   Requests/sec: 0.46

============================================================
✅ PASS - All performance targets met
============================================================
```

### Configuration

Edit `scripts/load-test-config.json` to customize:

```json
{
  "targets": {
    "p95_latency_ms": 3000,
    "p99_latency_ms": 5000,
    "error_rate_percent": 2
  },
  "test_profiles": {
    "custom": {
      "concurrent_users": 5,
      "requests_per_user": 20,
      "think_time_ms": 500
    }
  }
}
```

### CLI Options

```
node scripts/load-test.js [profile] [options]

Options:
  --token <token>     Auth token (or AI_LOAD_TEST_TOKEN env var)
  --base-url <url>    Override base URL
  --json              Output as JSON (for parsing)
  --ci                CI mode (exit code based on pass/fail)
  --help              Show help
```

---

## Next Steps After Pilot

1. **Add embeddings** for semantic search (pgvector)
2. **Implement streaming** for faster perceived response
3. **Add conversation summaries** for long threads
4. **Build admin dashboard** for analytics visualization
5. **Extract to microservice** if scaling needed
