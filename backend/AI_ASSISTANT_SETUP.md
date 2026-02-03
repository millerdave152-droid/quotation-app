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

## File Structure

```
backend/
├── services/ai/
│   ├── index.js          # Main orchestrator
│   ├── router.js         # Model routing logic
│   ├── tools.js          # Tool definitions
│   ├── context.js        # RAG context assembly
│   └── prompts/
│       └── system.js     # Prompt templates
├── routes/
│   └── ai-assistant.js   # API endpoints
├── migrations/
│   └── 001_ai_assistant_schema.sql
└── scripts/
    └── run-ai-migration.js

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
| `/api/ai/analytics/usage` | GET | Usage analytics (admin) |
| `/api/ai/analytics/pilot` | GET | Pilot dashboard (admin) |
| `/api/ai/health` | GET | Health check |

---

## Next Steps After Pilot

1. **Add embeddings** for semantic search (pgvector)
2. **Implement streaming** for faster perceived response
3. **Add conversation summaries** for long threads
4. **Build admin dashboard** for analytics visualization
5. **Extract to microservice** if scaling needed
