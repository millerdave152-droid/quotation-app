-- ============================================================
-- AI EVALUATION TABLES
-- Migration: 097_ai_evaluation_tables.sql
-- Tables for accuracy evaluation loop and golden set testing
-- ============================================================

BEGIN;

-- ============================================================
-- 1. EVALUATION CASES TABLE (Golden Set)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_eval_cases (
    id SERIAL PRIMARY KEY,

    -- Case identification
    case_id VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,  -- customer_lookup, product_search, quote_status, email_draft, policy, cross_sell
    difficulty VARCHAR(20) DEFAULT 'medium',  -- easy, medium, hard

    -- Input
    prompt TEXT NOT NULL,
    context_hints JSONB DEFAULT '{}',  -- Optional context like customer_id, product_id

    -- Expected outputs (for scoring)
    expected_answer TEXT,              -- Expected response content/keywords
    expected_product_ids INTEGER[],    -- Expected product IDs if applicable
    expected_policy_reference TEXT,    -- Expected policy/rule reference

    -- Scoring weights (0 or 1)
    has_answer_check BOOLEAN DEFAULT TRUE,
    has_product_check BOOLEAN DEFAULT FALSE,
    has_policy_check BOOLEAN DEFAULT FALSE,

    -- Metadata
    source VARCHAR(100),               -- Where this case came from (faq, docs, manual)
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. EVALUATION RUNS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_eval_runs (
    id SERIAL PRIMARY KEY,

    -- Run identification
    run_id UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    run_type VARCHAR(50) DEFAULT 'manual',  -- manual, scheduled, ci

    -- Aggregate scores
    total_cases INTEGER NOT NULL DEFAULT 0,
    passed_cases INTEGER NOT NULL DEFAULT 0,
    failed_cases INTEGER NOT NULL DEFAULT 0,

    -- Detailed scores
    answer_score_total INTEGER DEFAULT 0,
    answer_score_passed INTEGER DEFAULT 0,
    product_score_total INTEGER DEFAULT 0,
    product_score_passed INTEGER DEFAULT 0,
    policy_score_total INTEGER DEFAULT 0,
    policy_score_passed INTEGER DEFAULT 0,

    -- Computed metrics
    overall_accuracy DECIMAL(5,2),      -- Percentage 0-100
    answer_accuracy DECIMAL(5,2),
    product_accuracy DECIMAL(5,2),
    policy_accuracy DECIMAL(5,2),

    -- Performance
    avg_response_time_ms INTEGER,
    total_tokens_used INTEGER,
    total_cost_usd DECIMAL(10,6),

    -- Metadata
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    run_by VARCHAR(100),
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. EVALUATION RESULTS TABLE (Per-Case Results)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_eval_results (
    id SERIAL PRIMARY KEY,

    -- Links
    run_id UUID REFERENCES ai_eval_runs(run_id) ON DELETE CASCADE,
    case_id VARCHAR(50) REFERENCES ai_eval_cases(case_id) ON DELETE CASCADE,

    -- Response
    model_response TEXT,
    response_time_ms INTEGER,
    tokens_used INTEGER,

    -- Scores (0 or 1)
    answer_correct SMALLINT DEFAULT 0,
    product_correct SMALLINT DEFAULT 0,
    policy_correct SMALLINT DEFAULT 0,
    total_score SMALLINT GENERATED ALWAYS AS (answer_correct + product_correct + policy_correct) STORED,
    max_score SMALLINT DEFAULT 3,

    -- Details
    answer_notes TEXT,
    product_notes TEXT,
    policy_notes TEXT,

    -- Error tracking
    had_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_eval_cases_category ON ai_eval_cases(category);
CREATE INDEX IF NOT EXISTS idx_eval_cases_active ON ai_eval_cases(is_active);
CREATE INDEX IF NOT EXISTS idx_eval_runs_model ON ai_eval_runs(model_name);
CREATE INDEX IF NOT EXISTS idx_eval_runs_date ON ai_eval_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_results_run ON ai_eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_case ON ai_eval_results(case_id);

-- ============================================================
-- 5. EVALUATION SUMMARY VIEW
-- ============================================================
CREATE OR REPLACE VIEW ai_eval_summary AS
SELECT
    r.run_id,
    r.model_name,
    r.started_at,
    r.total_cases,
    r.passed_cases,
    r.overall_accuracy,
    r.answer_accuracy,
    r.product_accuracy,
    r.policy_accuracy,
    r.avg_response_time_ms,
    r.total_cost_usd,
    r.run_type,
    r.notes
FROM ai_eval_runs r
ORDER BY r.started_at DESC;

-- ============================================================
-- 6. WEEKLY COMPARISON VIEW
-- ============================================================
CREATE OR REPLACE VIEW ai_eval_weekly_comparison AS
SELECT
    DATE_TRUNC('week', started_at) AS week,
    model_name,
    COUNT(*) AS runs,
    ROUND(AVG(overall_accuracy)::numeric, 2) AS avg_accuracy,
    ROUND(AVG(answer_accuracy)::numeric, 2) AS avg_answer_accuracy,
    ROUND(AVG(product_accuracy)::numeric, 2) AS avg_product_accuracy,
    ROUND(AVG(policy_accuracy)::numeric, 2) AS avg_policy_accuracy,
    ROUND(AVG(avg_response_time_ms)::numeric, 0) AS avg_latency_ms,
    SUM(total_cost_usd) AS total_cost_usd
FROM ai_eval_runs
WHERE started_at >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', started_at), model_name
ORDER BY week DESC, model_name;

COMMIT;
