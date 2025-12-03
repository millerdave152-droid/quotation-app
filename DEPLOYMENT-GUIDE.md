# Quotation App - Deployment & Transfer Guide

## Quick Summary

To transfer this app to another location, you need to:
1. Copy the entire project folder
2. Install dependencies (`npm install` in both frontend and backend)
3. Configure the `.env` file with your settings
4. Start the servers

---

## Prerequisites

Before deploying, ensure the target machine has:
- **Node.js** v18 or higher (v20+ recommended)
- **npm** v9 or higher
- **Git** (optional, for version control)
- **PostgreSQL** database access (cloud or local)

---

## Method 1: Simple Folder Copy (Recommended for Local Transfer)

### Step 1: Prepare the Project
```bash
# On the source machine, clean up unnecessary files
cd Quotationapp_Backup

# Remove node_modules to reduce size (will reinstall on target)
rm -rf backend/node_modules
rm -rf frontend/node_modules

# Remove build artifacts
rm -rf frontend/build
rm -rf backend/coverage
```

### Step 2: Copy the Project
Copy the entire `Quotationapp_Backup` folder to your target location via:
- USB drive
- Network share
- Cloud storage (OneDrive, Google Drive, etc.)
- Git repository

### Step 3: Setup on Target Machine

```bash
# Navigate to the project
cd Quotationapp_Backup

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 4: Configure Environment

1. Copy the example environment file:
```bash
cd backend
cp .env.example .env
```

2. Edit `.env` with your settings:
```
# Required settings to update:
DB_HOST=your-database-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=quotationapp

# AWS (for email)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Mirakl/Best Buy (if using marketplace)
MIRAKL_API_KEY=your-api-key
MIRAKL_SHOP_ID=your-shop-id
```

### Step 5: Start the Application

**Option A: Development Mode (2 terminals)**
```bash
# Terminal 1 - Backend
cd backend
node server.js

# Terminal 2 - Frontend
cd frontend
npm start
```

**Option B: Production Mode**
```bash
# Build frontend
cd frontend
npm run build

# Start backend (serves both API and frontend)
cd ../backend
NODE_ENV=production node server.js
```

---

## Method 2: Git-Based Transfer (Recommended for Teams)

### Initial Setup (Source Machine)
```bash
cd Quotationapp_Backup
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/quotation-app.git
git push -u origin main
```

### Clone on Target Machine
```bash
git clone https://github.com/your-username/quotation-app.git
cd quotation-app
npm install --prefix backend
npm install --prefix frontend
```

---

## Database Setup

### Option A: Use Existing Cloud Database
If you're using the same AWS RDS database, just copy the same credentials to your `.env` file.

### Option B: Setup New Local Database
```bash
# Install PostgreSQL
# Create database
createdb quotationapp

# Run migrations
cd backend
node migrations/add-marketplace-tables.js
node migrations/add-inventory-pricing-tables.js
node migrations/add-bestbuy-categories.js
# ... run other migrations as needed
```

### Option C: Export/Import Database
```bash
# Export from source
pg_dump -h source-host -U username -d quotationapp > backup.sql

# Import to target
psql -h target-host -U username -d quotationapp < backup.sql
```

---

## Running the App

### Development
```bash
# Start backend (port 3001)
cd backend && node server.js

# Start frontend (port 3000)
cd frontend && npm start
```

### Production
```bash
# Build frontend
cd frontend && npm run build

# Serve with backend
cd backend && NODE_ENV=production node server.js
```

### Using PM2 (Recommended for Production)
```bash
# Install PM2 globally
npm install -g pm2

# Start backend with PM2
cd backend
pm2 start server.js --name quotation-backend

# Monitor
pm2 status
pm2 logs quotation-backend
```

---

## Troubleshooting

### Common Issues

**1. "Cannot connect to database"**
- Check DB_HOST, DB_USER, DB_PASSWORD in `.env`
- Ensure database is accessible from your network
- Check if SSL is required (DB_SSL=true)

**2. "Port already in use"**
```bash
# Find process using port
netstat -ano | findstr :3001
# Kill process
taskkill /PID <PID> /F
```

**3. "Module not found"**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**4. "CORS errors in browser"**
- Check that backend is running on port 3001
- Check frontend proxy settings in package.json

**5. "Marketplace sync failing"**
- Verify MIRAKL_API_KEY and MIRAKL_SHOP_ID in `.env`
- Check Mirakl API URL is correct

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| DB_HOST | Yes | PostgreSQL host |
| DB_NAME | Yes | Database name |
| DB_USER | Yes | Database username |
| DB_PASSWORD | Yes | Database password |
| DB_PORT | No | Database port (default: 5432) |
| PORT | No | Backend port (default: 3001) |
| NODE_ENV | No | Environment (development/production) |
| JWT_SECRET | Yes | JWT signing secret |
| AWS_ACCESS_KEY_ID | For email | AWS credentials |
| AWS_SECRET_ACCESS_KEY | For email | AWS credentials |
| EMAIL_FROM | For email | Sender email address |
| MIRAKL_API_KEY | For marketplace | Best Buy API key |
| MIRAKL_SHOP_ID | For marketplace | Your shop ID |

---

## Folder Structure

```
Quotationapp_Backup/
├── backend/
│   ├── server.js          # Main server entry
│   ├── db.js              # Database connection
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── migrations/        # Database migrations
│   ├── .env               # Environment config (don't commit!)
│   └── .env.example       # Template for env config
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React app
│   │   ├── components/    # React components
│   │   └── services/      # API services
│   ├── public/            # Static files
│   └── build/             # Production build
└── DEPLOYMENT-GUIDE.md    # This file
```

---

## Quick Commands Cheatsheet

```bash
# Start backend
cd backend && node server.js

# Start frontend (dev)
cd frontend && npm start

# Build frontend
cd frontend && npm run build

# Run backend tests
cd backend && npm test

# Check database connection
cd backend && node check-database.js

# Pull offers from Best Buy
curl -X POST http://localhost:3001/api/marketplace/pull-offers-from-bestbuy

# Run inventory sync
curl -X POST http://localhost:3001/api/marketplace/run-sync
```
