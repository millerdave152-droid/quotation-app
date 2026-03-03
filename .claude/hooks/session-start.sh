#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "Installing dependencies for Teletime Quotation & POS System..."

# Skip Puppeteer's Chromium download in remote environments (not needed for linting/testing)
export PUPPETEER_SKIP_DOWNLOAD=true

# Root dependencies
cd "$PROJECT_DIR"
if [ -f package-lock.json ]; then
  npm install --no-audit --no-fund 2>&1
fi

# Backend dependencies
cd "$PROJECT_DIR/backend"
if [ -f package-lock.json ]; then
  npm install --no-audit --no-fund 2>&1
fi

# Frontend dependencies
cd "$PROJECT_DIR/frontend"
if [ -f package-lock.json ]; then
  npm install --no-audit --no-fund 2>&1
fi

# POS dependencies
cd "$PROJECT_DIR/apps/pos"
if [ -f package-lock.json ]; then
  npm install --no-audit --no-fund 2>&1
fi

echo "All dependencies installed successfully."
