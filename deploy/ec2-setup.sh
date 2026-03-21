#!/bin/bash
# ============================================================================
# EC2 Instance Setup Script — TeleTime QuotationApp
# Run this on a fresh Ubuntu 22.04/24.04 EC2 t3.medium instance
#
# Usage:  chmod +x ec2-setup.sh && sudo ./ec2-setup.sh
# ============================================================================

set -euo pipefail

echo "============================================"
echo "  TeleTime QuotationApp — EC2 Setup"
echo "============================================"
echo ""

# ── 1. System updates ──
echo "[1/6] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ── 2. Install Docker ──
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "  Docker installed: $(docker --version)"
else
    echo "  Docker already installed: $(docker --version)"
fi

# ── 3. Add ubuntu user to docker group ──
echo "[3/6] Configuring Docker permissions..."
usermod -aG docker ubuntu || true
echo "  User 'ubuntu' added to docker group"

# ── 4. Install useful utilities ──
echo "[4/6] Installing utilities..."
apt-get install -y htop unzip jq git

# ── 5. Create app directory ──
echo "[5/6] Creating application directory..."
APP_DIR="/opt/teletime"
mkdir -p "$APP_DIR"
chown ubuntu:ubuntu "$APP_DIR"
echo "  App directory: $APP_DIR"

# ── 6. Configure system limits ──
echo "[6/6] Tuning system limits..."

# Increase file descriptors for Node.js
cat >> /etc/security/limits.conf <<EOF
ubuntu soft nofile 65536
ubuntu hard nofile 65536
EOF

# Optimize kernel for web traffic
cat >> /etc/sysctl.conf <<EOF
# TCP tuning for web server
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
EOF
sysctl -p

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Next steps:"
echo "    1. Log out and back in (for docker group)"
echo "    2. Transfer your app code to $APP_DIR"
echo "    3. Copy .env to $APP_DIR/backend/.env"
echo "    4. Run: cd $APP_DIR && docker compose up -d --build"
echo ""
echo "  Ports to open in Security Group:"
echo "    22   — SSH"
echo "    3000 — Frontend Admin"
echo "    3001 — Backend API (optional, for debugging)"
echo "    5000 — POS Terminal"
echo ""
