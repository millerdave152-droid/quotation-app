# Continuous Integration & Deployment Guide

This guide explains how to set up and use CI/CD for the Customer Quotation System.

## Table of Contents

- [Overview](#overview)
- [CI Platforms Supported](#ci-platforms-supported)
- [GitHub Actions Setup](#github-actions-setup)
- [GitLab CI Setup](#gitlab-ci-setup)
- [CircleCI Setup](#circleci-setup)
- [Local Testing](#local-testing)
- [Code Quality & Linting](#code-quality--linting)
- [Coverage Reports](#coverage-reports)
- [Troubleshooting](#troubleshooting)

## Overview

The project includes automated CI/CD pipelines that:

- ✅ Run all backend tests (42 tests)
- ✅ Run all frontend tests (29 tests)
- ✅ Generate code coverage reports
- ✅ Build the application
- ✅ Run security vulnerability scans
- ✅ Check code quality with linting
- ✅ Support multiple Node.js versions

## CI Platforms Supported

### 1. GitHub Actions (Primary)

**Configuration File:** `.github/workflows/ci.yml`

**Features:**
- Runs on every push and pull request
- Tests on Node.js 18.x and 20.x
- Parallel execution for frontend and backend
- Coverage reports uploaded to Codecov
- Build artifacts stored for 7 days

**Status Badge:**
```markdown
![CI Status](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI%2FCD%20Pipeline/badge.svg)
```

### 2. GitLab CI/CD

**Configuration File:** `.gitlab-ci.yml`

**Features:**
- Three stages: test, build, security
- Automatic coverage reporting in merge requests
- Caching for faster builds
- Security audit integration

### 3. CircleCI

**Configuration File:** `.circleci/config.yml`

**Features:**
- Docker-based builds
- Parallel test execution
- Test result storage
- Build artifact management

## GitHub Actions Setup

### Step 1: Enable GitHub Actions

1. Push your code to GitHub
2. Go to your repository settings
3. Navigate to **Actions** → **General**
4. Ensure Actions are enabled

### Step 2: Configure Secrets (Optional)

For advanced features, add these secrets in **Settings** → **Secrets and variables** → **Actions**:

- `CODECOV_TOKEN` - For coverage reports
- `DATABASE_URL` - For integration tests
- `AWS_ACCESS_KEY_ID` - For deployment

### Step 3: Push Code

```bash
git add .
git commit -m "Add CI/CD configuration"
git push origin main
```

GitHub Actions will automatically run on every push and pull request.

### Step 4: View Results

1. Go to the **Actions** tab in your repository
2. Click on the latest workflow run
3. View individual job results and logs

## GitLab CI Setup

### Step 1: Push to GitLab

```bash
git remote add gitlab https://gitlab.com/YOUR_USERNAME/YOUR_REPO.git
git push gitlab main
```

### Step 2: Enable CI/CD

1. Go to **Settings** → **CI/CD**
2. Expand **Runners**
3. Ensure shared runners are enabled

### Step 3: View Pipeline

1. Navigate to **CI/CD** → **Pipelines**
2. Click on the latest pipeline
3. View stage results and coverage

## CircleCI Setup

### Step 1: Connect Repository

1. Sign in to [CircleCI](https://circleci.com/)
2. Click **Set Up Project**
3. Select your repository
4. CircleCI will detect the config file

### Step 2: Configure Environment

Add environment variables in **Project Settings** → **Environment Variables**

### Step 3: Run Pipeline

CircleCI will automatically run on every commit.

## Local Testing

Before pushing to CI, run tests locally:

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run tests once (no watch mode)
npm test -- --watchAll=false

# Run tests with coverage
npm test -- --watchAll=false --coverage
```

### Run All Tests

From the root directory:

```bash
# Backend tests
(cd backend && npm test)

# Frontend tests
(cd frontend && npm test -- --watchAll=false)
```

## Code Quality & Linting

### ESLint

Check code for potential errors and style issues.

**Backend:**
```bash
cd backend

# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Frontend:**
```bash
cd frontend

# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Prettier

Format code consistently.

**Backend:**
```bash
cd backend

# Format all files
npm run format

# Check formatting
npm run format:check
```

### Pre-commit Checks

Before committing, run:

```bash
# Backend
cd backend
npm run lint
npm run format:check
npm test

# Frontend
cd frontend
npm run lint
npm test -- --watchAll=false
```

## Coverage Reports

### View Coverage Locally

**Backend:**
```bash
cd backend
npm test
# Open backend/coverage/lcov-report/index.html in browser
```

**Frontend:**
```bash
cd frontend
npm test -- --watchAll=false --coverage
# Open frontend/coverage/lcov-report/index.html in browser
```

### Coverage Thresholds

Current coverage:
- **Backend:** Focus on routes, middleware, services, utils
- **Frontend:** Focus on components, services, utilities

### Codecov Integration

1. Sign up at [Codecov.io](https://codecov.io/)
2. Add your repository
3. Get your Codecov token
4. Add `CODECOV_TOKEN` to GitHub Secrets
5. Coverage will be reported on every PR

## CI/CD Pipeline Stages

### 1. Backend Tests
- Installs dependencies
- Runs Jest tests
- Generates coverage report
- Uploads coverage to Codecov

### 2. Frontend Tests
- Installs dependencies
- Runs React tests
- Generates coverage report
- Uploads coverage to Codecov

### 3. Code Quality
- Runs ESLint (when configured)
- Checks code formatting
- Validates code standards

### 4. Build
- Builds production frontend
- Stores build artifacts
- Validates build success

### 5. Security Scan
- Runs `npm audit` on both projects
- Checks for high-severity vulnerabilities
- Reports security issues

### 6. Test Summary
- Aggregates all test results
- Reports overall status
- Fails pipeline if any tests fail

## Troubleshooting

### Tests Failing Locally but Passing in CI

**Cause:** Different Node.js versions or environment variables

**Solution:**
```bash
# Check Node.js version
node --version

# Use the same version as CI (20.x)
nvm install 20
nvm use 20
```

### Tests Passing Locally but Failing in CI

**Cause:** Missing dependencies or environment differences

**Solution:**
```bash
# Clean install dependencies
cd backend && rm -rf node_modules package-lock.json
npm install

cd ../frontend && rm -rf node_modules package-lock.json
npm install
```

### Coverage Threshold Not Met

**Cause:** Not enough code is covered by tests

**Solution:**
- Review uncovered lines in coverage report
- Add tests for uncovered code
- Adjust coverage thresholds if needed

### Build Artifacts Not Found

**Cause:** Build might have failed

**Solution:**
```bash
# Test build locally
cd frontend
npm run build
```

### Linting Errors

**Cause:** Code style violations

**Solution:**
```bash
# Auto-fix most issues
npm run lint:fix

# Format code
npm run format
```

## Best Practices

1. **Always run tests locally before pushing**
   ```bash
   npm test
   ```

2. **Keep dependencies updated**
   ```bash
   npm audit fix
   npm update
   ```

3. **Write tests for new features**
   - Add tests in `__tests__` directory
   - Maintain coverage above 70%

4. **Review CI logs when tests fail**
   - Check the specific job that failed
   - Read error messages carefully
   - Fix issues and push again

5. **Use feature branches**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git push origin feature/new-feature
   # Create pull request
   ```

6. **Monitor build times**
   - Keep tests fast
   - Use caching where possible
   - Parallelize when appropriate

## Adding New Tests

### Backend Test

Create a new file in `backend/__tests__/`:

```javascript
const request = require('supertest');
const express = require('express');

describe('New Feature Tests', () => {
  test('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Frontend Test

Create a new file in `frontend/src/`:

```javascript
import { render, screen } from '@testing-library/react';

describe('Component Tests', () => {
  test('should render component', () => {
    // Your test here
  });
});
```

## Environment Variables for CI

Set these in your CI platform:

- `NODE_ENV=test` - Testing environment
- `DATABASE_URL` - Test database connection
- `CODECOV_TOKEN` - Coverage reporting
- `REACT_APP_API_URL` - API endpoint for frontend

## Continuous Deployment (Future)

To add automated deployment:

1. Add deployment job to workflow
2. Configure deployment secrets
3. Add environment-specific builds
4. Set up staging and production environments

Example deployment step:
```yaml
deploy:
  needs: [backend-tests, frontend-tests, build]
  runs-on: ubuntu-latest
  steps:
    - name: Deploy to production
      run: |
        # Your deployment script
```

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitLab CI/CD Documentation](https://docs.gitlab.com/ee/ci/)
- [CircleCI Documentation](https://circleci.com/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review CI logs in the Actions/Pipelines tab
3. Run tests locally to reproduce issues
4. Check test coverage reports

---

**Last Updated:** 2025-11-23
**Maintained By:** Development Team
