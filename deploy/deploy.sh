#!/bin/bash
# ============================================================================
# Quick Deploy Script — run on EC2 at /opt/teletime
# Usage:  ./deploy/deploy.sh [build|restart|logs|status|migrate]
# ============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

ACTION="${1:-build}"

case "$ACTION" in
  build)
    echo "Building and starting all containers..."
    docker compose up -d --build
    echo ""
    echo "Waiting for backend health check..."
    sleep 10
    docker compose ps
    echo ""
    curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
    echo ""
    echo "Done. Access:"
    echo "  Frontend: http://$(curl -s ifconfig.me):3000"
    echo "  POS:      http://$(curl -s ifconfig.me):5000"
    echo "  API:      http://$(curl -s ifconfig.me):3001/health"
    ;;

  restart)
    echo "Restarting all containers..."
    docker compose restart
    docker compose ps
    ;;

  logs)
    SERVICE="${2:-}"
    if [ -n "$SERVICE" ]; then
      docker compose logs -f "$SERVICE"
    else
      docker compose logs -f --tail=100
    fi
    ;;

  status)
    docker compose ps
    echo ""
    echo "--- Resource Usage ---"
    docker stats --no-stream
    echo ""
    echo "--- Backend Health ---"
    curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || echo "Backend unreachable"
    echo ""
    echo "--- Migration Status ---"
    docker compose exec -T backend node scripts/migrate.js --status 2>/dev/null || echo "Cannot check migrations"
    ;;

  migrate)
    echo "Checking migration status..."
    docker compose exec backend node scripts/migrate.js --status
    echo ""
    read -p "Apply pending migrations? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      docker compose exec backend node scripts/migrate.js
    fi
    ;;

  *)
    echo "Usage: $0 [build|restart|logs|status|migrate]"
    echo ""
    echo "  build    — Build images and start containers"
    echo "  restart  — Restart all containers"
    echo "  logs     — Tail logs (optionally: logs backend|frontend|pos)"
    echo "  status   — Show container status, resources, and health"
    echo "  migrate  — Check and apply pending database migrations"
    exit 1
    ;;
esac
