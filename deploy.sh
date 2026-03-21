#!/bin/bash
# ============================================================================
# TeleTime — Production Deploy Script
#
# Usage:
#   ./deploy.sh
#
# What it does:
#   1. Logs the current commit hash + timestamp to deploy.log
#   2. Pulls latest code from origin/main
#   3. Builds and starts all Docker containers
#   4. Waits for containers to report healthy
#   5. Prints the deployed commit hash
#
# Prerequisites:
#   - Docker and docker-compose installed
#   - Git remote 'origin' configured
#   - Run from the project root directory
# ============================================================================

set -euo pipefail
cd "$(dirname "$0")"

DEPLOY_LOG="deploy.log"

echo "=== TeleTime Deploy ==="
echo ""

# 1. Record current state before pulling
PREV_HASH=$(git rev-parse --short HEAD)
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] deploy started — before: ${PREV_HASH}" >> "$DEPLOY_LOG"
echo "Previous commit: ${PREV_HASH}"

# 2. Pull latest from origin/main
echo "Pulling latest from origin/main..."
git pull origin main --ff-only
NEW_HASH=$(git rev-parse --short HEAD)
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] deploy pulled — after: ${NEW_HASH}" >> "$DEPLOY_LOG"
echo "New commit: ${NEW_HASH}"
echo ""

# 3. Build and start containers
echo "Building and starting containers..."
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

# Check if backend health endpoint responds
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "Backend health check: OK"
else
  echo "WARNING: Backend health check failed"
fi

# 5. Log success and print summary
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] deploy complete — commit: ${NEW_HASH}" >> "$DEPLOY_LOG"
echo ""
echo "=== Deploy Complete ==="
echo "Commit: ${NEW_HASH}"
echo "Log:    ${DEPLOY_LOG}"
