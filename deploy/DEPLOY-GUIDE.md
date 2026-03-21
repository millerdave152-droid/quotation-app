# TeleTime QuotationApp — Deployment Guide

## Prerequisites
- AWS account with EC2 access in **ca-central-1** (Montreal)
- SSH key pair created in ca-central-1
- RDS PostgreSQL already running (or will use existing instance)

---

## Step 1: Launch EC2 Instance

1. Go to **EC2 > Launch Instance** in ca-central-1
2. Settings:
   - **Name**: `teletime-app`
   - **AMI**: Ubuntu Server 24.04 LTS (or 22.04)
   - **Instance type**: `t3.medium` (2 vCPU, 4 GB RAM)
   - **Key pair**: Select your SSH key
   - **Storage**: 30 GB gp3
3. **Security Group** — create `teletime-sg` with these inbound rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH |
| 3000 | TCP | 0.0.0.0/0 | Frontend Admin |
| 3001 | TCP | Your IP | Backend API (debug only) |
| 5000 | TCP | 0.0.0.0/0 | POS Terminal |

4. Launch and note the **Public IP** (e.g., `3.96.xxx.xxx`)

---

## Step 2: Connect and Run Setup Script

```bash
# SSH into the instance
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Upload and run the setup script
# Option A: Copy from local machine
scp -i your-key.pem deploy/ec2-setup.sh ubuntu@<EC2_PUBLIC_IP>:/tmp/

# On the EC2 instance:
sudo chmod +x /tmp/ec2-setup.sh
sudo /tmp/ec2-setup.sh

# Log out and back in for docker group to take effect
exit
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Verify docker works without sudo
docker ps
```

---

## Step 3: Transfer Application Code

```bash
# FROM YOUR LOCAL MACHINE — zip the project (excluding node_modules)
cd "C:\Users\WD-PC1\OneDrive\Desktop\QuotationApp Work Edtion vol 1"

# Create a clean archive (run in Git Bash or PowerShell)
git archive --format=tar HEAD | gzip > /tmp/teletime-app.tar.gz

# Upload to EC2
scp -i your-key.pem /tmp/teletime-app.tar.gz ubuntu@<EC2_PUBLIC_IP>:/opt/teletime/

# ON THE EC2 INSTANCE — extract
cd /opt/teletime
tar -xzf teletime-app.tar.gz
rm teletime-app.tar.gz
```

---

## Step 4: Configure Production .env

```bash
# ON THE EC2 INSTANCE
# Copy the template
cp deploy/.env.production.template backend/.env

# Edit with your real values
nano backend/.env
```

**Critical values to set:**
- `DB_PASSWORD` and `DB_ADMIN_PASSWORD` — your RDS passwords
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — generate fresh:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- `ALLOWED_ORIGINS` — replace `<EC2_PUBLIC_IP>` with actual IP:
  ```
  ALLOWED_ORIGINS=http://3.96.xxx.xxx:3000,http://3.96.xxx.xxx:5000
  ```
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — your AWS SES creds
- All other `<CHANGE_ME>` values

---

## Step 5: Build and Start

```bash
cd /opt/teletime

# Build all 3 containers and start in detached mode
docker compose up -d --build

# Watch the build progress (takes 3-5 min first time)
docker compose logs -f

# Check all containers are running
docker compose ps
```

Expected output:
```
NAME       STATUS                    PORTS
backend    Up (healthy)              0.0.0.0:3001->3001/tcp
frontend   Up                        0.0.0.0:3000->80/tcp
pos        Up                        0.0.0.0:5000->80/tcp
```

---

## Step 6: Verify Health

```bash
# Backend health check
curl http://localhost:3001/health | jq .

# Frontend (should return HTML)
curl -s http://localhost:3000 | head -5

# POS (should return HTML)
curl -s http://localhost:5000 | head -5
```

---

## Step 7: Run Migrations (if needed)

The migrations have already been applied to the RDS database. But if you're
starting fresh or there are new migrations:

```bash
# Check migration status
docker compose exec backend node scripts/migrate.js --status

# Dry run to see what would be applied
docker compose exec backend node scripts/migrate.js --dry-run

# Apply pending migrations
docker compose exec backend node scripts/migrate.js
```

If this is a fresh RDS database, you need to baseline first:
```bash
docker compose exec backend node scripts/migrate-baseline.js
```

---

## Step 8: Smoke Test

Open in your browser:

| App | URL | Expected |
|-----|-----|----------|
| Frontend Admin | `http://<EC2_IP>:3000` | Login page |
| POS Terminal | `http://<EC2_IP>:5000` | POS login page |
| Backend Health | `http://<EC2_IP>:3001/health` | JSON with status OK |

### POS Smoke Test Checklist

1. **Login** — `admin@yourcompany.com` / `TestPass123!`
2. **Open Shift** — Enter opening float amount, count cash
3. **Add Items** — Search for a product, add to cart
4. **Checkout** — Select Cash payment, complete transaction
5. **View Transaction** — Check transaction history shows the sale
6. **Process Return** — Return one item from the transaction
7. **Close Shift** — Count cash drawer, verify reconciliation

---

## Common Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f pos

# Restart a single service
docker compose restart backend

# Stop everything
docker compose down

# Rebuild and restart (after code changes)
docker compose up -d --build

# Check container resource usage
docker stats
```

---

## Updating the App

```bash
cd /opt/teletime

# Pull latest code (or upload new archive)
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Run any new migrations
docker compose exec backend node scripts/migrate.js
```

---

## Later: SSL + Domain Setup

When DNS access is available:

1. Point `app.teletime.ca` → EC2 IP
2. Point `pos.teletime.ca` → EC2 IP
3. Install Caddy or Certbot for automatic SSL
4. Update `ALLOWED_ORIGINS` in `.env` to use `https://` URLs
5. Update Security Group to allow ports 80/443 and remove 3000/5000
