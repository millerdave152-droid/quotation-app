# Production Setup Guide

Complete guide to deploying your quotation app to production.

## Prerequisites

- GitHub repository set up ✅
- CI/CD pipeline running ✅
- All tests passing ✅

## Quick Deploy Options

### Option 1: Heroku (Easiest)

**Backend Deployment:**
```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create your-quotation-api

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set JWT_SECRET=your_secret_key
heroku config:set AWS_ACCESS_KEY_ID=your_key
heroku config:set AWS_SECRET_ACCESS_KEY=your_secret
heroku config:set EMAIL_FROM=noreply@yourdomain.com

# Deploy
git subtree push --prefix backend heroku main

# Run migrations
heroku run node migrations/setup-database.js
```

**Frontend Deployment:**
```bash
# Option A: Netlify (recommended for React)
# 1. Connect GitHub repo to Netlify
# 2. Build command: npm run build
# 3. Publish directory: build
# 4. Environment variable: REACT_APP_API_URL=https://your-quotation-api.herokuapp.com

# Option B: Vercel
vercel --prod
```

### Option 2: AWS (Most Scalable)

**Backend on EC2:**
```bash
# Launch EC2 instance (Ubuntu 22.04)
# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Clone repository
git clone https://github.com/millerdave152-droid/quotation-app.git
cd quotation-app/backend

# Install dependencies
npm install --production

# Set up environment variables
cp .env.example .env
nano .env  # Edit with your values

# Install PM2 for process management
sudo npm install -g pm2

# Start application
pm2 start server.js --name quotation-api
pm2 startup
pm2 save

# Set up nginx reverse proxy
sudo apt install nginx
# Configure nginx (see nginx.conf below)
```

**Frontend on S3 + CloudFront:**
```bash
cd frontend

# Build production bundle
npm run build

# Upload to S3
aws s3 sync build/ s3://your-bucket-name --delete

# Set up CloudFront distribution
# Point to S3 bucket
# Configure custom domain
```

### Option 3: DigitalOcean App Platform

```bash
# 1. Connect GitHub repo
# 2. Select branch: main
# 3. Configure services:

Backend:
  - Name: quotation-api
  - Type: Web Service
  - Build Command: npm install
  - Run Command: node server.js
  - Port: 3001

Frontend:
  - Name: quotation-frontend
  - Type: Static Site
  - Build Command: npm run build
  - Output Directory: build

# 4. Add PostgreSQL database
# 5. Set environment variables
# 6. Deploy!
```

## Environment Variables Setup

### Backend (.env)
```env
NODE_ENV=production
PORT=3001
DB_HOST=your-production-db-host
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-secure-password
DB_NAME=quotation_production
JWT_SECRET=your-super-secure-random-string-256-bits
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
CORS_ORIGIN=https://your-frontend-domain.com
```

### Frontend (.env.production)
```env
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_ENABLE_ANALYTICS=true
```

## Database Setup

### PostgreSQL Production

```sql
-- Create database
CREATE DATABASE quotation_production;

-- Create user
CREATE USER quotation_user WITH PASSWORD 'secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE quotation_production TO quotation_user;

-- Run migrations
\c quotation_production
\i database-migration.sql
```

## Security Checklist

- [ ] All environment variables use production values
- [ ] JWT_SECRET is strong and unique
- [ ] Database passwords are secure
- [ ] HTTPS enabled (SSL/TLS certificates)
- [ ] CORS configured for production domain only
- [ ] Rate limiting enabled
- [ ] Security headers configured (Helmet.js)
- [ ] Database backups configured
- [ ] Monitoring and logging set up

## SSL/HTTPS Setup

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Nginx Configuration

Create `/etc/nginx/sites-available/quotation-app`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        root /var/www/quotation-app;
        try_files $uri $uri/ /index.html;
    }
}
```

## Monitoring & Logging

### Set up Application Monitoring

**Sentry (Error Tracking):**
```bash
npm install @sentry/node @sentry/react

# Backend (server.js)
const Sentry = require("@sentry/node");
Sentry.init({ dsn: "your-sentry-dsn" });

# Frontend (index.js)
import * as Sentry from "@sentry/react";
Sentry.init({ dsn: "your-sentry-dsn" });
```

**PM2 Monitoring:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Database Backups

### Automated PostgreSQL Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
pg_dump -U quotation_user quotation_production | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz
# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-db.sh

# Add to crontab (daily at 2 AM)
0 2 * * * /usr/local/bin/backup-db.sh
```

## Performance Optimization

### Backend
```javascript
// Enable compression
const compression = require('compression');
app.use(compression());

// Connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Frontend
```bash
# Optimize build
npm run build

# Analyze bundle size
npm install --save-dev webpack-bundle-analyzer
```

## Health Checks

Add to your CI/CD workflow:

```yaml
- name: Health Check
  run: |
    curl -f https://your-api-domain.com/api/health || exit 1
```

## Deployment Workflow

### Automated with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "your-app-name"
          heroku_email: "your-email@example.com"
```

## Rollback Strategy

```bash
# Heroku rollback
heroku rollback

# PM2 rollback
pm2 reload quotation-api

# Manual rollback
git checkout previous-stable-commit
git push heroku main --force
```

## Cost Estimates

### Heroku
- Hobby tier: $7/month (backend)
- PostgreSQL mini: $5/month
- Netlify free tier (frontend)
- **Total: ~$12/month**

### AWS
- EC2 t3.micro: $10/month
- RDS PostgreSQL t3.micro: $15/month
- S3 + CloudFront: $5/month
- **Total: ~$30/month**

### DigitalOcean
- Basic Droplet: $12/month
- Managed PostgreSQL: $15/month
- **Total: ~$27/month**

## Post-Deployment Checklist

- [ ] Application accessible at production URL
- [ ] All tests passing in production
- [ ] Database migrations completed
- [ ] SSL certificate installed and working
- [ ] Environment variables configured
- [ ] Monitoring and error tracking active
- [ ] Backups configured and tested
- [ ] Performance acceptable (load testing)
- [ ] Security scan passed
- [ ] Documentation updated with production URLs

## Maintenance

### Weekly
- Check error logs
- Review performance metrics
- Check disk space

### Monthly
- Update dependencies: `npm update`
- Review security alerts
- Test backup restoration
- Review and optimize database queries

### Quarterly
- Security audit
- Performance optimization
- User feedback review
- Infrastructure cost review

## Getting Help

- **Documentation:** See repository docs
- **CI/CD Issues:** Check Actions tab
- **Deployment Issues:** Check platform logs
- **Application Errors:** Check Sentry/logs

---

**Ready to deploy?** Start with Heroku for easiest setup, then scale to AWS/DigitalOcean as needed.
