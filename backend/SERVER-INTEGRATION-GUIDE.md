# SERVER.JS INTEGRATION GUIDE

## Before Integration (Current State)

Your current server.js has:
- ❌ CORS open to all origins
- ❌ No authentication
- ❌ No rate limiting
- ❌ SSL validation disabled
- ❌ No input validation
- ✅ 70+ working API endpoints

## After Integration (Secured State)

Your server.js will have:
- ✅ CORS restricted to production domain
- ✅ JWT authentication required for sensitive endpoints
- ✅ Rate limiting on all routes
- ✅ Security headers (Helmet)
- ✅ Input validation on all POST/PUT routes
- ✅ Authentication endpoints (/api/auth/*)

---

## INTEGRATION STEPS

### Step 1: Add Imports at Top of server.js

```javascript
// Add these imports after existing requires (around line 10)
const helmet = require('helmet');
const { securityMiddleware, corsMiddleware, generalLimiter } = require('./middleware/security');
const authRoutes = require('./routes/auth');
const { authenticate, requireRole } = require('./middleware/auth');
```

### Step 2: Replace CORS Configuration

**FIND (around line 18-21):**
```javascript
app.use(cors({
  origin: true, // Allow ANY origin for development
  credentials: true
}));
```

**REPLACE WITH:**
```javascript
// Security middleware
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(generalLimiter);
```

### Step 3: Fix SSL Configuration

**FIND (around line 41):**
```javascript
ssl: { rejectUnauthorized: false }
```

**REPLACE WITH:**
```javascript
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true }
  : { rejectUnauthorized: false }
```

### Step 4: Add Authentication Routes

**ADD AFTER line 75 (after health check):**
```javascript
// ============================================
// AUTHENTICATION ROUTES
// ============================================
app.use('/api/auth', authRoutes);
```

### Step 5: Protect Existing Routes (OPTIONAL - Choose Strategy)

You have two options:

**OPTION A: Protect Everything (Most Secure)**
Add authentication to ALL routes except health check and auth routes:

```javascript
// Add after auth routes
app.use('/api', authenticate); // All /api routes require authentication
```

**OPTION B: Protect Selectively (Flexible)**
Add authentication to specific sensitive routes:

```javascript
// Protect specific routes
app.use('/api/customers', authenticate);
app.use('/api/quotations', authenticate);
app.use('/api/quotes', authenticate);
app.use('/api/products', authenticate);
```

**OPTION C: Role-Based Protection (Advanced)**
Protect routes based on user roles:

```javascript
// Public routes (no auth)
app.get('/api/health', ...)

// User routes (any authenticated user)
app.use('/api/products', authenticate);

// Admin-only routes
app.use('/api/customers', authenticate, requireRole('admin'));
app.use('/api/analytics', authenticate, requireRole('admin', 'manager'));
```

---

## TESTING THE INTEGRATION

### 1. Test Health Check (Should still work without auth)
```bash
curl http://localhost:3001/api/health
```

Expected: `{"status":"OK","message":"Backend is running",...}`

### 2. Test Protected Route Without Auth (Should fail)
```bash
curl http://localhost:3001/api/customers
```

Expected: `{"error":"No token provided"}`

### 3. Test Registration
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

Expected: `{"message":"User registered successfully","user":{...},"accessToken":"...", "refreshToken":"..."}`

### 4. Test Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "Admin123!"
  }'
```

Expected: `{"message":"Login successful","user":{...},"accessToken":"...", "refreshToken":"..."}`

### 5. Test Protected Route WITH Auth
```bash
# First login and save the token
TOKEN="your-access-token-from-login"

curl http://localhost:3001/api/customers \
  -H "Authorization: Bearer $TOKEN"
```

Expected: Customer data

---

## ROLLBACK PLAN

If something breaks after integration:

1. **Immediate Rollback:**
   ```bash
   git checkout server.js
   ```

2. **Disable Auth Temporarily:**
   Comment out the authentication middleware:
   ```javascript
   // app.use('/api', authenticate);
   ```

3. **Revert CORS:**
   Change back to:
   ```javascript
   app.use(cors({ origin: true, credentials: true }));
   ```

---

## COMMON ISSUES & SOLUTIONS

### Issue: "Cannot find module './middleware/auth'"
**Solution:** Ensure all middleware files were created in the middleware/ directory

### Issue: "helmet is not a function"
**Solution:** Run `npm install helmet`

### Issue: "No token provided" on all routes
**Solution:** Check that auth routes (/api/auth/*) are NOT protected

### Issue: CORS errors from frontend
**Solution:** Update ALLOWED_ORIGINS in middleware/security.js to include your frontend URL

---

## NEXT STEPS AFTER INTEGRATION

1. **Test all authentication endpoints**
2. **Update frontend to use authentication**
3. **Generate new JWT secrets for production**
4. **Rotate AWS credentials**
5. **Deploy to staging environment**
6. **Conduct security audit**

---

Ready to integrate? Let me know and I'll update server.js for you automatically!
