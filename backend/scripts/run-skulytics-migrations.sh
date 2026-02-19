#!/usr/bin/env bash
# ============================================================
# run-skulytics-migrations.sh
# Runs Skulytics migration files in order using DATABASE_URL.
#
# Usage:
#   ./scripts/run-skulytics-migrations.sh          # run UP migrations
#   ./scripts/run-skulytics-migrations.sh --down    # run DOWN rollbacks (reverse order)
#   ./scripts/run-skulytics-migrations.sh --dry-run # print files without executing
#
# Requires: psql, DATABASE_URL environment variable
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../migrations/skulytics"

# Ordered migration files
UP_FILES=(
  "00_skulytics_extensions.sql"
  "10_global_skulytics_products.sql"
  "15_tenants_bootstrap.sql"
  "20_tenant_product_overrides.sql"
  "30_skulytics_import_matches.sql"
  "40_skulytics_sync_runs.sql"
  "50_products_skulytics_enrichment.sql"
  "60_quote_items_snapshot.sql"
)

DOWN_FILES=(
  "60_quote_items_snapshot.down.sql"
  "50_products_skulytics_enrichment.down.sql"
  "40_skulytics_sync_runs.down.sql"
  "30_skulytics_import_matches.down.sql"
  "20_tenant_product_overrides.down.sql"
  "15_tenants_bootstrap.down.sql"
  "10_global_skulytics_products.down.sql"
  "00_skulytics_extensions.down.sql"
)

# ── Helpers ──────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
  echo "Usage: $0 [--down] [--dry-run]"
  echo ""
  echo "  --down      Run rollback migrations in reverse order (60 -> 00)"
  echo "  --dry-run   Print the files that would be executed without running them"
  exit 1
}

# ── Parse args ───────────────────────────────────────────────

DIRECTION="up"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --down)    DIRECTION="down" ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h) usage ;;
    *)         log_error "Unknown argument: $arg"; usage ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────

if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL environment variable is not set."
  echo ""
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/dbname'"
  echo ""
  exit 1
fi

if ! command -v psql &> /dev/null; then
  log_error "psql is not installed or not in PATH."
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  log_error "Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

# ── Select files ─────────────────────────────────────────────

if [ "$DIRECTION" = "down" ]; then
  FILES=("${DOWN_FILES[@]}")
  log_warn "Running ROLLBACK migrations (reverse order)"
else
  FILES=("${UP_FILES[@]}")
  log_info "Running UP migrations"
fi

echo ""
echo "  Database: ${DATABASE_URL%%@*}@***"
echo "  Direction: $DIRECTION"
echo "  Files: ${#FILES[@]}"
echo ""

# ── Execute ──────────────────────────────────────────────────

PASSED=0
TOTAL=${#FILES[@]}

for file in "${FILES[@]}"; do
  filepath="$MIGRATIONS_DIR/$file"

  if [ ! -f "$filepath" ]; then
    log_error "Migration file not found: $filepath"
    echo ""
    echo "  Stopping. $PASSED/$TOTAL migrations completed before failure."
    exit 1
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] Would execute: $file"
    PASSED=$((PASSED + 1))
    continue
  fi

  echo -n "  Executing: $file ... "

  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$filepath" > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}FAILED${NC}"
    echo ""
    log_error "Migration failed: $file"
    echo ""
    echo "  Stopping on first failure. $PASSED/$TOTAL migrations completed."
    echo "  Fix the issue and re-run. Already-applied idempotent migrations will be skipped."
    echo ""
    echo "  To see the error, run manually:"
    echo "    psql \$DATABASE_URL -v ON_ERROR_STOP=1 -f $filepath"
    exit 1
  fi
done

echo ""
if [ "$DRY_RUN" = true ]; then
  log_info "Dry run complete. $PASSED/$TOTAL files would be executed."
else
  log_info "All $PASSED/$TOTAL migrations applied successfully."
fi
