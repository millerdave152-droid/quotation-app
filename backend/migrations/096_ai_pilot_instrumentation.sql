-- ============================================================
-- AI PILOT INSTRUMENTATION ENHANCEMENTS
-- Migration: 096_ai_pilot_instrumentation.sql
-- Adds hourly metrics, error tracking views, and indexes for pilot monitoring
-- ============================================================

BEGIN;

-- ============================================================
-- 1. HOURLY METRICS VIEW (for real-time monitoring)
-- ============================================================
CREATE OR REPLACE VIEW ai_hourly_stats AS
SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS total_queries,
    COUNT(DISTINCT user_id) AS unique_users,
    ROUND(AVG(response_time_ms)::numeric, 0) AS avg_response_time_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p95_response_time_ms,
    SUM(estimated_cost_usd) AS total_cost_usd,
    SUM(total_tokens) AS total_tokens,
    COUNT(*) FILTER (WHERE error_occurred) AS error_count,
    COUNT(*) FILTER (WHERE user_feedback IS NOT NULL) AS feedback_count,
    COUNT(*) FILTER (WHERE user_feedback = 'helpful') AS helpful_count,
    COUNT(*) FILTER (WHERE user_feedback = 'not_helpful') AS not_helpful_count
FROM ai_query_logs
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ============================================================
-- 2. RECENT ERRORS VIEW (for debugging)
-- ============================================================
CREATE OR REPLACE VIEW ai_recent_errors AS
SELECT
    id,
    user_id,
    query_type,
    LEFT(query_text, 100) AS query_preview,
    routed_to_model,
    error_type,
    error_message,
    response_time_ms,
    created_at
FROM ai_query_logs
WHERE error_occurred = TRUE
ORDER BY created_at DESC
LIMIT 100;

-- ============================================================
-- 3. FEEDBACK SUMMARY VIEW (for pilot review)
-- ============================================================
CREATE OR REPLACE VIEW ai_feedback_summary AS
SELECT
    DATE(created_at) AS date,
    query_type,
    COUNT(*) FILTER (WHERE user_feedback = 'helpful') AS helpful,
    COUNT(*) FILTER (WHERE user_feedback = 'not_helpful') AS not_helpful,
    COUNT(*) FILTER (WHERE user_feedback = 'incorrect') AS incorrect,
    COUNT(*) FILTER (WHERE user_feedback IS NOT NULL) AS total_feedback,
    ROUND(
        COUNT(*) FILTER (WHERE user_feedback = 'helpful')::numeric * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE user_feedback IS NOT NULL), 0),
        1
    ) AS helpful_rate_percent
FROM ai_query_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), query_type
ORDER BY date DESC, total_feedback DESC;

-- ============================================================
-- 4. REAL-TIME METRICS VIEW (current state)
-- ============================================================
CREATE OR REPLACE VIEW ai_realtime_metrics AS
SELECT
    -- Last hour
    (SELECT COUNT(*) FROM ai_query_logs WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') AS queries_last_hour,
    (SELECT ROUND(AVG(response_time_ms)::numeric, 0) FROM ai_query_logs WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') AS avg_latency_last_hour_ms,
    (SELECT COUNT(*) FROM ai_query_logs WHERE error_occurred AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') AS errors_last_hour,

    -- Today
    (SELECT COUNT(*) FROM ai_query_logs WHERE created_at >= CURRENT_DATE) AS queries_today,
    (SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM ai_query_logs WHERE created_at >= CURRENT_DATE) AS cost_today_usd,
    (SELECT ROUND(AVG(response_time_ms)::numeric, 0) FROM ai_query_logs WHERE created_at >= CURRENT_DATE) AS avg_latency_today_ms,
    (SELECT COUNT(*) FROM ai_query_logs WHERE error_occurred AND created_at >= CURRENT_DATE) AS errors_today,

    -- Error rate (last 24h)
    (SELECT
        ROUND(COUNT(*) FILTER (WHERE error_occurred)::numeric * 100.0 / NULLIF(COUNT(*), 0), 2)
     FROM ai_query_logs
     WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    ) AS error_rate_24h_percent,

    -- Feedback rate (last 7 days)
    (SELECT
        ROUND(COUNT(*) FILTER (WHERE user_feedback IS NOT NULL)::numeric * 100.0 / NULLIF(COUNT(*), 0), 2)
     FROM ai_query_logs
     WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    ) AS feedback_rate_7d_percent,

    -- Current timestamp
    CURRENT_TIMESTAMP AS generated_at;

-- ============================================================
-- 5. LATENCY PERCENTILES VIEW
-- ============================================================
CREATE OR REPLACE VIEW ai_latency_percentiles AS
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS total_queries,
    ROUND(AVG(response_time_ms)::numeric, 0) AS avg_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p50_ms,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p75_ms,
    ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p90_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p95_ms,
    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 0) AS p99_ms,
    MAX(response_time_ms) AS max_ms
FROM ai_query_logs
WHERE response_time_ms IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================
-- 6. ADD INDEX FOR MESSAGE-BASED FEEDBACK LOOKUP
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_message
    ON ai_query_logs(message_id)
    WHERE message_id IS NOT NULL;

-- ============================================================
-- 7. ADD INDEX FOR HOURLY QUERIES (using created_at directly)
-- ============================================================
-- Note: DATE_TRUNC is not IMMUTABLE, so we index on created_at
-- and let the query planner use it for hour-based aggregations
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_created_at_desc
    ON ai_query_logs(created_at DESC);

COMMIT;
