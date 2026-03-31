-- ============================================================================
-- Migration 175: Universal Semantic Search Infrastructure
--
-- Adds inline search_embedding vector(1536) columns to four entity tables
-- for hybrid FTS + vector search. pgvector already installed (migration 001).
-- Separate product_embeddings / customer_embeddings tables (001) remain
-- for the AI assistant; these inline columns are for the search subsystem.
--
-- Uses HNSW indexes (consistent with existing codebase pattern) instead of
-- IVFFlat — HNSW works correctly on empty/sparse columns and doesn't
-- require pre-populated data for index construction.
-- ============================================================================

BEGIN;

-- Ensure pgvector is available (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. Add search_embedding columns (additive only — no ALTER existing cols)
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

ALTER TABLE customer_notes
  ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

-- ============================================================================
-- 2. HNSW indexes for approximate nearest neighbor search
--    Cosine distance operator: vector_cosine_ops
--
-- HNSW Index Configuration
-- Current: m=16, ef_construction=64 (pgvector defaults)
-- Acceptable for catalog size: up to ~50,000 products
-- At 50,000+ products: run REINDEX with m=32, ef_construction=128
-- At 200,000+ products: run REINDEX with m=64, ef_construction=256
-- Monitor recall with: SELECT * FROM pg_stat_user_indexes
--   WHERE indexname LIKE '%search_embedding%';
-- Reindex command (zero-downtime):
-- REINDEX INDEX CONCURRENTLY idx_products_search_embedding;
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_search_embedding
  ON customers
  USING hnsw (search_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_products_search_embedding
  ON products
  USING hnsw (search_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_quotations_search_embedding
  ON quotations
  USING hnsw (search_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_customer_notes_search_embedding
  ON customer_notes
  USING hnsw (search_embedding vector_cosine_ops);

-- ============================================================================
-- 3. Search log for analytics and debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_log (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),
  surface      VARCHAR(20) NOT NULL,
  query        TEXT NOT NULL,
  result_count INTEGER,
  top_entity   VARCHAR(30),
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_log_user
  ON search_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_log_created
  ON search_log(created_at DESC);

COMMIT;
