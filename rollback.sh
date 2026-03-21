#!/bin/bash
# ============================================================================
# TeleTime — Production Rollback Script
#
# Usage:
#   ./rollback.sh <commit-hash>
#
# Example:
#   ./rollback.sh 443eedf
#
# What it does:
#   1. Validates the commit hash argument
#   2. Checks out that specific commit (detached HEAD)
#   3. Rebuilds and restarts all Docker containers
#   4. Waits for containers to report healthy
#   5. Logs the rollback to deploy.log
#
# To return to latest after rollback:
#   git checkout main && ./deploy.sh
# ============================================================================

set -euo pipefail
cd "$(dirname "$0")"

DEPLOY_LOG="deploy.log"
TARGET_HASH="${1:-}"

# 1. Validate argument
if [ -z "$TARGET_HASH" ]; then
  echo "Error: commit hash required"
  echo "Usage: ./rollback.sh <commit-hash>"
  echo ""
  echo "Recent commits:"
  git log --oneline -10
  exit 1
fi

# Verify the commit exists
if ! git cat-file -t "$TARGET_HASH" > /dev/null 2>&1; then
  echo "Error: commit '${TARGET_HASH}' not found"
  echo ""
  echo "Recent commits:"
  git log --oneline -10
  exit 1
fi

CURRENT_HASH=$(git rev-parse --short HEAD)
SHORT_TARGET=$(git rev-parse --short "$TARGET_HASH")

echo "=== TeleTime Rollback ==="
echo ""
echo "Current commit:  ${CURRENT_HASH}"
echo "Rolling back to: ${SHORT_TARGET}"
echo ""

# 2. Checkout target commit
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] rollback started — from: ${CURRENT_HASH} to: ${SHORT_TARGET}" >> "$DEPLOY_LOG"
git checkout "$TARGET_HASH"
echo ""

# 3. Rebuild and restart containers
echo "Rebuilding containers at ${SHORT_TARGET}..."
docker compose up --build -d
echo ""

# 4. Wait for containers to become healthy
echo "Waiting for containers to become healthy..."
MAX_WAIT=90
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $MAX_WAIT ]; do
  UNHEALTHY=$(docker compose ps --format json 2>/dev/null | grep -c '"unhealthy"\|"starting"' || true)
  if [ "$UNHEALTHY" -eq 0 ]; then
    break
  fi
  echo "  ... waiting (${ELAPSED}s)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

# Show final container status
echo ""
docker compose ps
echo ""

# Check backend health
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "Backend health check: OK"
else
  echo "WARNING: Backend health check failed"
fi

# 5. Log and summarize
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] rollback complete — now at: ${SHORT_TARGET}" >> "$DEPLOY_LOG"
echo ""
echo "=== Rollback Complete ==="
echo "Now running: ${SHORT_TARGET}"
echo ""
echo "NOTE: You are in detached HEAD state."
echo "To return to latest: git checkout main && ./deploy.sh"
