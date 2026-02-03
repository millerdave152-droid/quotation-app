-- ============================================================
-- AI ASSISTANT SCHEMA MIGRATION
-- TeleTime Solutions - Customer Support Assistant Pilot
--
-- Run this migration on your RDS PostgreSQL 16.8 instance
-- Requires: rds_superuser role for CREATE EXTENSION
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENABLE PGVECTOR EXTENSION
-- ============================================================
-- Note: On RDS, you need rds_superuser privileges
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension is enabled
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension failed to install';
    END IF;
    RAISE NOTICE 'pgvector extension enabled successfully';
END $$;

-- ============================================================
-- 2. PRODUCT EMBEDDINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS product_embeddings (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER, -- For multi-location filtering (future use)

    -- Embedding vector (1536 dimensions for OpenAI text-embedding-3-small)
    embedding vector(1536) NOT NULL,

    -- Source text that was embedded (for debugging/reindexing)
    source_text TEXT NOT NULL,

    -- Embedding model used (allows migration between models)
    model_version VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',

    -- Token count of source text (for cost tracking)
    token_count INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- One embedding per product per model version
    CONSTRAINT unique_product_embedding UNIQUE (product_id, model_version)
);

-- HNSW index for fast approximate nearest neighbor search
-- ef_construction=64: good balance of build time and recall
-- m=16: connections per layer (16 is default, good for most cases)
CREATE INDEX IF NOT EXISTS idx_product_embeddings_vector
    ON product_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_embeddings_product_id
    ON product_embeddings(product_id);

CREATE INDEX IF NOT EXISTS idx_product_embeddings_location
    ON product_embeddings(location_id)
    WHERE location_id IS NOT NULL;

-- ============================================================
-- 3. CUSTOMER EMBEDDINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_embeddings (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    location_id INTEGER, -- For multi-location filtering (future use)

    -- Embedding of customer profile summary
    embedding vector(1536) NOT NULL,

    -- What was embedded (customer summary text)
    source_text TEXT NOT NULL,

    model_version VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
    token_count INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_customer_embedding UNIQUE (customer_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_customer_embeddings_vector
    ON customer_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_customer_embeddings_customer_id
    ON customer_embeddings(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_embeddings_location
    ON customer_embeddings(location_id)
    WHERE location_id IS NOT NULL;

-- ============================================================
-- 4. AI CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who initiated the conversation
    user_id INTEGER NOT NULL REFERENCES users(id),
    location_id INTEGER, -- For multi-location filtering

    -- Conversation metadata
    title VARCHAR(255), -- Auto-generated from first message
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'deleted')),

    -- Context tracking (if conversation focuses on specific entity)
    customer_context_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    quotation_context_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,

    -- Token usage tracking for the conversation
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id
    ON ai_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_last_message
    ON ai_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_status
    ON ai_conversations(status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_conversations_customer
    ON ai_conversations(customer_context_id)
    WHERE customer_context_id IS NOT NULL;

-- ============================================================
-- 5. AI MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('user', 'assistant', 'system', 'tool_use', 'tool_result')),
    content TEXT NOT NULL,

    -- For tool calls (function calling)
    tool_name VARCHAR(100),
    tool_input JSONB,
    tool_result JSONB,
    tool_use_id VARCHAR(100), -- Anthropic's tool_use_id for matching

    -- Token tracking
    input_tokens INTEGER,
    output_tokens INTEGER,

    -- Which model handled this message
    model_used VARCHAR(50),

    -- Sequence within conversation (for ordering)
    sequence_num INTEGER NOT NULL,

    -- Response time for assistant messages
    response_time_ms INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
    ON ai_messages(conversation_id, sequence_num);

CREATE INDEX IF NOT EXISTS idx_ai_messages_created
    ON ai_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_tool
    ON ai_messages(tool_name)
    WHERE tool_name IS NOT NULL;

-- ============================================================
-- 6. AI QUERY LOGS TABLE (Analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to conversation/message
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES ai_messages(id) ON DELETE SET NULL,

    -- Request metadata
    user_id INTEGER NOT NULL REFERENCES users(id),
    location_id INTEGER,

    -- Query classification
    query_type VARCHAR(50), -- 'customer_lookup', 'product_search', 'quote_status', etc.
    query_text TEXT NOT NULL,

    -- Model routing decision
    routed_to_model VARCHAR(50) NOT NULL,
    routing_reason VARCHAR(100), -- 'simple_lookup', 'vip_customer', 'email_draft', etc.

    -- RAG context assembled
    context_sources JSONB, -- [{type, id, relevance_score}]
    context_token_count INTEGER,

    -- Response metrics
    response_time_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd DECIMAL(10, 6),

    -- Quality signals
    user_feedback VARCHAR(20)
        CHECK (user_feedback IN ('helpful', 'not_helpful', 'incorrect')),
    feedback_notes TEXT,
    feedback_at TIMESTAMP WITH TIME ZONE,

    -- Error tracking
    error_occurred BOOLEAN DEFAULT FALSE,
    error_type VARCHAR(100),
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_user
    ON ai_query_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_type
    ON ai_query_logs(query_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_model
    ON ai_query_logs(routed_to_model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_created
    ON ai_query_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_errors
    ON ai_query_logs(created_at DESC)
    WHERE error_occurred = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_feedback
    ON ai_query_logs(created_at DESC)
    WHERE user_feedback IS NOT NULL;

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to search products by semantic similarity
CREATE OR REPLACE FUNCTION search_products_semantic(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    p_location_id INT DEFAULT NULL
)
RETURNS TABLE (
    product_id INTEGER,
    similarity FLOAT,
    source_text TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pe.product_id,
        (1 - (pe.embedding <=> query_embedding))::FLOAT AS similarity,
        pe.source_text
    FROM product_embeddings pe
    WHERE (1 - (pe.embedding <=> query_embedding)) > match_threshold
      AND (p_location_id IS NULL OR pe.location_id = p_location_id OR pe.location_id IS NULL)
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to search customers by semantic similarity
CREATE OR REPLACE FUNCTION search_customers_semantic(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    p_location_id INT DEFAULT NULL
)
RETURNS TABLE (
    customer_id INTEGER,
    similarity FLOAT,
    source_text TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.customer_id,
        (1 - (ce.embedding <=> query_embedding))::FLOAT AS similarity,
        ce.source_text
    FROM customer_embeddings ce
    WHERE (1 - (ce.embedding <=> query_embedding)) > match_threshold
      AND (p_location_id IS NULL OR ce.location_id = p_location_id OR ce.location_id IS NULL)
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get conversation context (last N messages)
CREATE OR REPLACE FUNCTION get_conversation_context(
    p_conversation_id UUID,
    p_max_messages INT DEFAULT 20
)
RETURNS TABLE (
    role VARCHAR(20),
    content TEXT,
    tool_name VARCHAR(100),
    tool_input JSONB,
    tool_result JSONB,
    tool_use_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.role,
        m.content,
        m.tool_name,
        m.tool_input,
        m.tool_result,
        m.tool_use_id,
        m.created_at
    FROM ai_messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.sequence_num ASC
    LIMIT p_max_messages;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation stats after each message
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ai_conversations
    SET
        total_input_tokens = total_input_tokens + COALESCE(NEW.input_tokens, 0),
        total_output_tokens = total_output_tokens + COALESCE(NEW.output_tokens, 0),
        last_message_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation stats
DROP TRIGGER IF EXISTS trg_update_conversation_stats ON ai_messages;
CREATE TRIGGER trg_update_conversation_stats
    AFTER INSERT ON ai_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();

-- ============================================================
-- 8. ANALYTICS VIEWS
-- ============================================================

-- Daily usage summary
CREATE OR REPLACE VIEW ai_daily_stats AS
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS total_queries,
    COUNT(DISTINCT user_id) AS unique_users,
    ROUND(AVG(response_time_ms)::numeric, 0) AS avg_response_time_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p95_response_time_ms,
    SUM(estimated_cost_usd) AS total_cost_usd,
    ROUND(AVG(estimated_cost_usd)::numeric, 6) AS avg_cost_per_query,
    SUM(total_tokens) AS total_tokens,
    COUNT(*) FILTER (WHERE error_occurred) AS error_count,
    COUNT(*) FILTER (WHERE user_feedback = 'helpful') AS helpful_count,
    COUNT(*) FILTER (WHERE user_feedback = 'not_helpful') AS not_helpful_count,
    COUNT(*) FILTER (WHERE user_feedback = 'incorrect') AS incorrect_count
FROM ai_query_logs
GROUP BY DATE(created_at);

-- Model usage breakdown
CREATE OR REPLACE VIEW ai_model_stats AS
SELECT
    routed_to_model AS model,
    DATE(created_at) AS date,
    COUNT(*) AS query_count,
    ROUND(AVG(response_time_ms)::numeric, 0) AS avg_response_time_ms,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(estimated_cost_usd) AS total_cost_usd,
    ROUND((COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY DATE(created_at))) * 100, 1) AS percent_of_daily
FROM ai_query_logs
GROUP BY routed_to_model, DATE(created_at);

-- Query type distribution
CREATE OR REPLACE VIEW ai_query_type_stats AS
SELECT
    query_type,
    COUNT(*) AS total_queries,
    ROUND(AVG(response_time_ms)::numeric, 0) AS avg_response_time_ms,
    ROUND(AVG(total_tokens)::numeric, 0) AS avg_tokens,
    ROUND(
        COUNT(*) FILTER (WHERE user_feedback = 'helpful')::numeric * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE user_feedback IS NOT NULL), 0),
        1
    ) AS helpful_rate_percent,
    SUM(estimated_cost_usd) AS total_cost_usd
FROM ai_query_logs
WHERE query_type IS NOT NULL
GROUP BY query_type
ORDER BY total_queries DESC;

-- User activity summary
CREATE OR REPLACE VIEW ai_user_stats AS
SELECT
    u.id AS user_id,
    CONCAT(u.first_name, ' ', u.last_name) AS user_name,
    u.role,
    COUNT(q.id) AS total_queries,
    COUNT(DISTINCT DATE(q.created_at)) AS active_days,
    MAX(q.created_at) AS last_query_at,
    SUM(q.estimated_cost_usd) AS total_cost_usd,
    ROUND(
        COUNT(*) FILTER (WHERE q.user_feedback = 'helpful')::numeric * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE q.user_feedback IS NOT NULL), 0),
        1
    ) AS helpful_rate_percent
FROM users u
LEFT JOIN ai_query_logs q ON q.user_id = u.id
GROUP BY u.id, u.first_name, u.last_name, u.role;

-- ============================================================
-- 9. PILOT DASHBOARD VIEW
-- ============================================================
-- Single view for quick pilot health check
CREATE OR REPLACE VIEW ai_pilot_dashboard AS
SELECT
    -- Overall stats
    (SELECT COUNT(*) FROM ai_query_logs) AS total_queries_all_time,
    (SELECT COUNT(*) FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS queries_last_7_days,
    (SELECT COUNT(*) FROM ai_query_logs WHERE created_at >= CURRENT_DATE) AS queries_today,

    -- Cost
    (SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM ai_query_logs) AS total_cost_all_time,
    (SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS cost_last_7_days,

    -- Performance
    (SELECT ROUND(AVG(response_time_ms)::numeric, 0) FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS avg_response_time_7d_ms,
    (SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS p95_response_time_7d_ms,

    -- Quality
    (SELECT COUNT(*) FROM ai_query_logs WHERE error_occurred AND created_at >= CURRENT_DATE - INTERVAL '7 days') AS errors_last_7_days,
    (SELECT
        ROUND(COUNT(*) FILTER (WHERE user_feedback = 'helpful')::numeric * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE user_feedback IS NOT NULL), 0), 1)
     FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ) AS helpful_rate_7d_percent,

    -- Model distribution (last 7 days)
    (SELECT COUNT(*) FROM ai_query_logs WHERE routed_to_model LIKE '%haiku%' AND created_at >= CURRENT_DATE - INTERVAL '7 days') AS haiku_queries_7d,
    (SELECT COUNT(*) FROM ai_query_logs WHERE routed_to_model LIKE '%sonnet%' AND created_at >= CURRENT_DATE - INTERVAL '7 days') AS sonnet_queries_7d,

    -- Active users
    (SELECT COUNT(DISTINCT user_id) FROM ai_query_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS unique_users_7d;

-- ============================================================
-- 10. GRANT PERMISSIONS (adjust role name as needed)
-- ============================================================
-- If you have a specific app role, uncomment and modify:
-- GRANT SELECT, INSERT, UPDATE ON product_embeddings TO app_role;
-- GRANT SELECT, INSERT, UPDATE ON customer_embeddings TO app_role;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_conversations TO app_role;
-- GRANT SELECT, INSERT ON ai_messages TO app_role;
-- GRANT SELECT, INSERT, UPDATE ON ai_query_logs TO app_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- Check pgvector is working
-- SELECT '[1,2,3]'::vector;

-- Check tables created
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name LIKE 'ai_%' OR table_name LIKE '%_embeddings';

-- Check indexes
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE tablename LIKE 'ai_%' OR tablename LIKE '%_embeddings';
