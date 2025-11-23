# GitHub Setup Guide

Follow these steps to push your code to GitHub and activate CI/CD.

## Step 1: Create GitHub Repository

### Option A: Via GitHub Website (Recommended)

1. Go to [GitHub](https://github.com)
2. Sign in to your account
3. Click the **+** icon in top right → **New repository**
4. Fill in details:
   - **Repository name:** `quotation-app` (or your preferred name)
   - **Description:** Customer Quotation System with automated testing
   - **Visibility:** Choose Public or Private
   - ⚠️ **DO NOT** initialize with README, .gitignore, or license
   - ⚠️ Leave repository completely empty
5. Click **Create repository**

### Option B: Via GitHub CLI (If installed)

```bash
gh repo create quotation-app --public --source=. --remote=origin
```

## Step 2: Add GitHub Remote

After creating the repository on GitHub, copy the repository URL and run:

```bash
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/quotation-app.git

# Verify remote was added
git remote -v
```

You should see:
```
origin  https://github.com/YOUR_USERNAME/quotation-app.git (fetch)
origin  https://github.com/YOUR_USERNAME/quotation-app.git (push)
```

## Step 3: Rename Branch to Main (Optional)

GitHub uses `main` as the default branch name:

```bash
git branch -M main
```

## Step 4: Push to GitHub

```bash
# Push and set upstream
git push -u origin main
```

Enter your GitHub credentials if prompted.

## Step 5: Watch CI/CD Run! 🎉

1. Go to your GitHub repository
2. Click the **Actions** tab
3. You'll see "CI/CD Pipeline" running
4. Click on it to watch:
   - Backend tests (42 tests)
   - Frontend tests (29 tests)
   - Build process
   - Security scan

The entire pipeline takes about 3-5 minutes.

## Step 6: Add Status Badge (Optional)

Once the workflow completes, add a status badge to your README:

1. Go to **Actions** tab
2. Click on "CI/CD Pipeline" workflow
3. Click the **...** menu → **Create status badge**
4. Copy the markdown
5. Add to top of your README.md:

```markdown
# Customer Quotation System

![CI Status](https://github.com/YOUR_USERNAME/quotation-app/workflows/CI%2FCD%20Pipeline/badge.svg)

A professional quotation management system with automated testing.
```

## What Happens on Every Push

```
You push code
    ↓
GitHub Actions triggers automatically
    ↓
Tests run on Node.js 18.x and 20.x
    ├─ Backend: 42 tests
    └─ Frontend: 29 tests
    ↓
Application builds
    ↓
Security scan runs
    ↓
Results posted
    └─ ✅ Green checkmark if all pass
    └─ ❌ Red X if anything fails
```

## Troubleshooting

### Authentication Issues

**Using HTTPS:**
```bash
# You may need to use a Personal Access Token instead of password
# Go to GitHub → Settings → Developer settings → Personal access tokens
# Generate new token with 'repo' scope
# Use token as password when pushing
```

**Using SSH (Alternative):**
```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to SSH agent
ssh-add ~/.ssh/id_ed25519

# Copy public key and add to GitHub
# GitHub → Settings → SSH and GPG keys → New SSH key
cat ~/.ssh/id_ed25519.pub

# Use SSH URL instead
git remote set-url origin git@github.com:YOUR_USERNAME/quotation-app.git
git push -u origin main
```

### Push Rejected

If you get "Updates were rejected":
```bash
# Pull first if repository has any files
git pull origin main --allow-unrelated-histories

# Then push
git push -u origin main
```

### CI Fails But Tests Pass Locally

Check the Actions log for specific errors. Common issues:
- Environment variables not set
- Different Node.js version
- Missing dependencies

## Next Steps After Push

1. **Enable Branch Protection**
   - Settings → Branches → Add rule
   - Require status checks before merging
   - Require pull request reviews

2. **Set Up Codecov (Optional)**
   - Sign up at [codecov.io](https://codecov.io)
   - Add repository
   - Add `CODECOV_TOKEN` to GitHub Secrets

3. **Configure Notifications**
   - Settings → Notifications
   - Get email when builds fail

4. **Invite Collaborators**
   - Settings → Collaborators
   - Add team members

## Viewing Test Results

After each push:
1. Go to **Actions** tab
2. Click latest workflow run
3. View:
   - Test summaries
   - Coverage reports
   - Build logs
   - Timing information

## Making Changes

Now that CI is active:

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# ... edit files ...

# Run tests locally first!
npm test

# Commit and push
git add .
git commit -m "Add new feature"
git push origin feature/new-feature

# Create Pull Request on GitHub
# CI runs automatically on PR
# Merge after tests pass
```

## Success Criteria

✅ Repository created on GitHub
✅ Code pushed successfully
✅ Actions tab shows workflow running
✅ All tests pass (green checkmarks)
✅ Badge added to README (optional)

---

**You're all set!** Every push now triggers automated testing. 🚀
