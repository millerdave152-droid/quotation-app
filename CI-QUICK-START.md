# CI/CD Quick Start Guide

Get your continuous integration up and running in 5 minutes!

## Prerequisites

- Node.js 18.x or 20.x installed
- Git repository initialized
- GitHub/GitLab/CircleCI account

## Quick Setup

### Option 1: GitHub Actions (Recommended)

1. **Push your code to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git add .
   git commit -m "Add CI/CD configuration"
   git push -u origin main
   ```

2. **That's it!** GitHub Actions will automatically:
   - Run 42 backend tests
   - Run 29 frontend tests
   - Generate coverage reports
   - Build the application

3. **View results**
   - Go to your GitHub repository
   - Click the **Actions** tab
   - See your workflow running

### Option 2: GitLab CI

1. **Push to GitLab**
   ```bash
   git remote add gitlab https://gitlab.com/YOUR_USERNAME/YOUR_REPO.git
   git push gitlab main
   ```

2. **Check pipeline**
   - Go to **CI/CD** → **Pipelines**
   - Watch your tests run

### Option 3: CircleCI

1. Sign in to CircleCI
2. Click **Set Up Project**
3. Select your repository
4. Done! CircleCI auto-detects the config

## Run Tests Locally

### Windows
```bash
run-all-tests.bat
```

### Mac/Linux
```bash
chmod +x run-all-tests.sh
./run-all-tests.sh
```

## What Gets Tested?

### Backend (42 tests)
- ✅ Health check endpoint
- ✅ Customer CRUD operations
- ✅ Product CRUD operations
- ✅ Quotation CRUD operations
- ✅ Error handling

### Frontend (29 tests)
- ✅ App component rendering
- ✅ Currency formatting
- ✅ Email validation
- ✅ Phone formatting
- ✅ API caching service

## CI Workflow

```
Push Code → Run Tests → Build App → Generate Reports → ✓ Success!
```

## Common Commands

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test -- --watchAll=false

# Check code style
cd backend && npm run lint
cd frontend && npm run lint

# Auto-fix style issues
npm run lint:fix

# Format code
npm run format
```

## What Happens on Every Commit?

1. **Tests Run** - All 71 tests execute automatically
2. **Coverage Generated** - See which code is tested
3. **Build Verified** - Ensures production build works
4. **Security Scan** - Checks for vulnerabilities
5. **Results Posted** - See pass/fail in PR comments

## View Coverage Reports

### Locally
```bash
# Backend
cd backend && npm test
# Open: backend/coverage/lcov-report/index.html

# Frontend
cd frontend && npm test -- --coverage
# Open: frontend/coverage/lcov-report/index.html
```

### In CI
- Coverage automatically uploaded to Codecov
- View in pull request comments
- Track coverage trends over time

## Troubleshooting

### Tests fail in CI but pass locally?
```bash
# Use same Node version as CI
nvm install 20
nvm use 20
npm test
```

### Build fails?
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Linting errors?
```bash
# Auto-fix
npm run lint:fix
```

## Next Steps

1. **Add status badge to README**
   ```markdown
   ![CI Status](https://github.com/USER/REPO/workflows/CI%2FCD%20Pipeline/badge.svg)
   ```

2. **Set up Codecov** (optional)
   - Sign up at codecov.io
   - Add `CODECOV_TOKEN` to GitHub Secrets
   - Get coverage reports on PRs

3. **Enable branch protection**
   - Require tests to pass before merge
   - Settings → Branches → Add rule

4. **Configure notifications**
   - Get notified when builds fail
   - Settings → Notifications

## Support

- 📖 Full guide: See `CI-CD-GUIDE.md`
- 🐛 Issues? Check CI logs in Actions/Pipelines tab
- 💬 Questions? Review test files in `__tests__/` directories

---

**You're all set!** Every push now runs comprehensive tests automatically.
