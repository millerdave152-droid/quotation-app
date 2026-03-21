-- Migration Tracking Fix Script
-- Generated: 2026-03-10
-- Purpose: Update schema_migrations to reflect renamed duplicate files
--
-- IMPORTANT: Review this script before running.
-- Run with: psql -f scripts/fix-migration-tracking.sql
-- Or via node: node -e "require('dotenv').config({path:'backend/.env'}); ..."

BEGIN;

-- ============================================================
-- 1. Update renamed duplicate File B filenames
-- ============================================================

UPDATE schema_migrations SET filename = '178_pos_tables.sql'
  WHERE filename = '001_pos_tables.sql';

UPDATE schema_migrations SET filename = '179_pos_test_seed_data.sql'
  WHERE filename = '010_pos_test_seed_data.sql';

UPDATE schema_migrations SET filename = '180_product_images.sql'
  WHERE filename = '049_product_images.sql';

UPDATE schema_migrations SET filename = '181_discontinued_products.sql'
  WHERE filename = '050_discontinued_products.sql';

UPDATE schema_migrations SET filename = '182_loyalty_points.sql'
  WHERE filename = '051_loyalty_points.sql';

UPDATE schema_migrations SET filename = '183_marketing_attribution.sql'
  WHERE filename = '052_marketing_attribution.sql';

UPDATE schema_migrations SET filename = '184_employee_time_clock.sql'
  WHERE filename = '053_employee_time_clock.sql';

UPDATE schema_migrations SET filename = '185_pos_permissions.sql'
  WHERE filename = '054_pos_permissions.sql';

UPDATE schema_migrations SET filename = '186_excelsior_warranties.sql'
  WHERE filename = '096_excelsior_warranties.sql';

UPDATE schema_migrations SET filename = '187_offline_approval_support.sql'
  WHERE filename = '111_offline_approval_support.sql';

UPDATE schema_migrations SET filename = '188_pricing_engine.sql'
  WHERE filename = '112_pricing_engine.sql';

UPDATE schema_migrations SET filename = '189_messaging_hub.sql'
  WHERE filename = '115_messaging_hub.sql';

UPDATE schema_migrations SET filename = '190_fraud_scores.sql'
  WHERE filename = '156_fraud_scores.sql';

UPDATE schema_migrations SET filename = '191_order_versions.sql'
  WHERE filename = '157_order_versions.sql';

UPDATE schema_migrations SET filename = '192_mv_employee_fraud_metrics.sql'
  WHERE filename = '160_mv_employee_fraud_metrics.sql';

-- ============================================================
-- 2. Remove the .down.sql rollback file from tracking
--    (it was erroneously applied as a forward migration)
-- ============================================================

DELETE FROM schema_migrations
  WHERE filename = '121_ce_integration_support.down.sql';

-- ============================================================
-- 3. Verification queries
-- ============================================================

-- Should return 0 (no old filenames remain)
SELECT COUNT(*) AS orphaned_old_names FROM schema_migrations
  WHERE filename IN (
    '001_pos_tables.sql',
    '010_pos_test_seed_data.sql',
    '049_product_images.sql',
    '050_discontinued_products.sql',
    '051_loyalty_points.sql',
    '052_marketing_attribution.sql',
    '053_employee_time_clock.sql',
    '054_pos_permissions.sql',
    '096_excelsior_warranties.sql',
    '111_offline_approval_support.sql',
    '112_pricing_engine.sql',
    '115_messaging_hub.sql',
    '156_fraud_scores.sql',
    '157_order_versions.sql',
    '160_mv_employee_fraud_metrics.sql',
    '121_ce_integration_support.down.sql'
  );

-- Should return 15 (all new filenames present)
SELECT COUNT(*) AS renamed_present FROM schema_migrations
  WHERE filename IN (
    '178_pos_tables.sql',
    '179_pos_test_seed_data.sql',
    '180_product_images.sql',
    '181_discontinued_products.sql',
    '182_loyalty_points.sql',
    '183_marketing_attribution.sql',
    '184_employee_time_clock.sql',
    '185_pos_permissions.sql',
    '186_excelsior_warranties.sql',
    '187_offline_approval_support.sql',
    '188_pricing_engine.sql',
    '189_messaging_hub.sql',
    '190_fraud_scores.sql',
    '191_order_versions.sql',
    '192_mv_employee_fraud_metrics.sql'
  );

-- Should return 0 (no .down.sql files in tracking)
SELECT COUNT(*) AS down_files_remaining FROM schema_migrations
  WHERE filename LIKE '%.down.sql';

COMMIT;
