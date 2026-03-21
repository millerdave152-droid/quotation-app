-- ============================================================================
-- Migration 176: AI Business Assistant
--
-- New session-based assistant with surface-aware personas, tool use,
-- and live data access. Separate from the existing ai_conversations /
-- ai_messages tables which remain for the original Customer Support AI.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Assistant Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_sessions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  surface         VARCHAR(20) NOT NULL,
  location_id     INTEGER,
  context         JSONB DEFAULT '{}',
  title           VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_active     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user
  ON assistant_sessions(user_id, last_active DESC);

-- ============================================================================
-- 2. Assistant Messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_messages (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER NOT NULL
                    REFERENCES assistant_sessions(id)
                    ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  tool_results    JSONB,
  tokens_used     INTEGER,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_session
  ON assistant_messages(session_id, created_at ASC);

-- ============================================================================
-- 3. Assistant Tool Calls (granular logging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_tool_calls (
  id              SERIAL PRIMARY KEY,
  message_id      INTEGER NOT NULL
                    REFERENCES assistant_messages(id)
                    ON DELETE CASCADE,
  tool_name       VARCHAR(50) NOT NULL,
  input           JSONB NOT NULL,
  output          JSONB,
  success         BOOLEAN,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_message
  ON assistant_tool_calls(message_id);

COMMIT;
