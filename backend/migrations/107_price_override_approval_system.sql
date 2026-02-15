-- ============================================================================
-- Migration 107: Price Override Approval System
-- ============================================================================
-- Creates tables for the real-time price override approval workflow:
-- 1. approval_requests       - Override requests from salesperson to manager
-- 2. approval_counter_offers - Back-and-forth negotiation on price
-- 3. manager_availability    - Live presence tracking for remote approvals
-- 4. approval_tier_settings  - Configurable discount tiers and limits
-- ============================================================================

BEGIN;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Approval request status
DO $$ BEGIN
  CREATE TYPE approval_request_status AS ENUM (
    'pending',      -- Awaiting manager response
    'approved',     -- Manager approved at requested or counter price
    'denied',       -- Manager denied the override
    'countered',    -- Manager offered a different price
    'timed_out',    -- Request expired before response
    'cancelled'     -- Salesperson cancelled the request
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Approval method (how the override was authorized)
DO $$ BEGIN
  CREATE TYPE approval_method AS ENUM (
    'remote',   -- Manager approved from their own device
    'pin'       -- Manager entered PIN at the salesperson's terminal
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Counter-offer originator
DO $$ BEGIN
  CREATE TYPE counter_offer_by AS ENUM (
    'manager',      -- Manager proposed a counter-price
    'salesperson'   -- Salesperson re-proposed after a counter
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Counter-offer status
DO $$ BEGIN
  CREATE TYPE counter_offer_status AS ENUM (
    'pending',    -- Awaiting response
    'accepted',   -- Accepted by the other party
    'declined',   -- Declined by the other party
    'expired'     -- Timed out
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Manager availability status
DO $$ BEGIN
  CREATE TYPE manager_availability_status AS ENUM (
    'online',   -- Active and accepting requests
    'away',     -- Temporarily unavailable
    'offline'   -- Not connected
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLE: approval_requests
-- ============================================================================
-- Each row represents one price-override request from a salesperson.
-- NOTE: cart_id / cart_item_id are plain integers (no FK) because the POS
-- cart is managed client-side in React state, not in the database.

CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,

  -- Cart context (client-side IDs, no FK)
  cart_id          INTEGER,
  cart_item_id     INTEGER,

  -- Product & people
  product_id       INTEGER REFERENCES products(id),
  salesperson_id   INTEGER NOT NULL REFERENCES users(id),
  manager_id       INTEGER REFERENCES users(id),           -- NULL until assigned/responded

  -- Status
  status           approval_request_status NOT NULL DEFAULT 'pending',
  tier             INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),

  -- Pricing snapshot at request time
  original_price   DECIMAL(10,2) NOT NULL,
  requested_price  DECIMAL(10,2) NOT NULL,
  approved_price   DECIMAL(10,2),                          -- NULL until approved/countered
  cost_at_time     DECIMAL(10,2) NOT NULL,
  margin_amount    DECIMAL(10,2),
  margin_percent   DECIMAL(5,2),

  -- Reason
  reason_code      VARCHAR(50),
  reason_note      TEXT,

  -- Auth method
  method           approval_method,

  -- Token for remote approval links
  approval_token   VARCHAR(64) UNIQUE,
  token_used       BOOLEAN NOT NULL DEFAULT FALSE,
  token_expires_at TIMESTAMP WITH TIME ZONE,

  -- Performance tracking
  response_time_ms INTEGER,

  -- Timestamps
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMP WITH TIME ZONE,

  -- Sanity checks
  CONSTRAINT valid_prices CHECK (original_price >= 0 AND requested_price >= 0),
  CONSTRAINT valid_approved_price CHECK (approved_price IS NULL OR approved_price >= 0),
  CONSTRAINT requested_below_original CHECK (requested_price <= original_price)
);

-- ============================================================================
-- TABLE: approval_counter_offers
-- ============================================================================
-- Tracks the negotiation history when a manager counters with a different
-- price and the salesperson may accept, decline, or re-counter.

CREATE TABLE IF NOT EXISTS approval_counter_offers (
  id SERIAL PRIMARY KEY,

  approval_request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,

  -- Who made this offer
  offered_by       counter_offer_by NOT NULL,

  -- Pricing
  price            DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  margin_amount    DECIMAL(10,2),
  margin_percent   DECIMAL(5,2),

  -- Status
  status           counter_offer_status NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- TABLE: manager_availability
-- ============================================================================
-- Real-time presence tracking so the system knows which managers can receive
-- remote approval requests.  Updated by heartbeat pings from the manager UI.

CREATE TABLE IF NOT EXISTS manager_availability (
  id SERIAL PRIMARY KEY,

  user_id               INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  status                manager_availability_status NOT NULL DEFAULT 'offline',
  last_heartbeat        TIMESTAMP WITH TIME ZONE,
  active_device_count   INTEGER NOT NULL DEFAULT 0,
  pending_request_count INTEGER NOT NULL DEFAULT 0,
  last_updated          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: approval_tier_settings
-- ============================================================================
-- Configurable tiers that map discount ranges to approval requirements.

CREATE TABLE IF NOT EXISTS approval_tier_settings (
  id SERIAL PRIMARY KEY,

  tier                    INTEGER UNIQUE NOT NULL CHECK (tier BETWEEN 1 AND 4),
  name                    VARCHAR(50) NOT NULL,

  -- Discount range this tier covers
  min_discount_percent    DECIMAL(5,2),
  max_discount_percent    DECIMAL(5,2),

  -- Margin floor (NULL = no floor enforced)
  min_margin_percent      DECIMAL(5,2),

  -- Special flags
  allows_below_cost       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Who can approve
  required_role           VARCHAR(20) NOT NULL,

  -- Timeout (0 or NULL = no timeout)
  timeout_seconds         INTEGER NOT NULL DEFAULT 180,

  -- Workflow
  requires_reason_code    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Sanity
  CONSTRAINT valid_discount_range CHECK (
    min_discount_percent IS NULL OR max_discount_percent IS NULL
    OR min_discount_percent <= max_discount_percent
  )
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- approval_requests: salesperson queue
CREATE INDEX IF NOT EXISTS idx_approval_requests_salesperson_status
  ON approval_requests(salesperson_id, status);

-- approval_requests: manager queue
CREATE INDEX IF NOT EXISTS idx_approval_requests_manager_status
  ON approval_requests(manager_id, status);

-- approval_requests: cart lookup
CREATE INDEX IF NOT EXISTS idx_approval_requests_cart
  ON approval_requests(cart_id);

-- approval_requests: token lookup (only unused tokens)
CREATE INDEX IF NOT EXISTS idx_approval_requests_token
  ON approval_requests(approval_token)
  WHERE token_used = FALSE;

-- approval_requests: pending requests for timeout sweeper
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending_created
  ON approval_requests(created_at)
  WHERE status = 'pending';

-- approval_counter_offers: lookup by request
CREATE INDEX IF NOT EXISTS idx_approval_counter_offers_request
  ON approval_counter_offers(approval_request_id);

-- manager_availability: find online managers
CREATE INDEX IF NOT EXISTS idx_manager_availability_status
  ON manager_availability(user_id, status);

-- ============================================================================
-- SEED: Default tier settings
-- ============================================================================

INSERT INTO approval_tier_settings (tier, name, min_discount_percent, max_discount_percent, min_margin_percent, allows_below_cost, required_role, timeout_seconds, requires_reason_code)
VALUES
  (1, 'Salesperson Discretion', 0,     10,    NULL,  FALSE, 'salesperson',     0,   FALSE),
  (2, 'Standard Override',      10.01, 25,    5,     FALSE, 'manager',         180, FALSE),
  (3, 'Deep Override',          25.01, 50,    0,     FALSE, 'senior_manager',  300, FALSE),
  (4, 'Below Cost',             50.01, 100,   NULL,  TRUE,  'admin',           0,   TRUE)
ON CONFLICT (tier) DO NOTHING;

COMMIT;
