/**
 * Unit tests for backend/middleware/auth.js
 *
 * Tests all exported middleware:
 *   authenticate, optionalAuth, requireRole, requirePermission,
 *   requireOwnershipOrAdmin, requireActiveAccount, authenticateApiKey
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock the JWT utility
const mockVerifyAccessToken = jest.fn();
jest.mock('../utils/jwt', () => ({
  verifyAccessToken: (...args) => mockVerifyAccessToken(...args),
}));

// Mock the DB module (rawPool + tenantContext)
const mockQuery = jest.fn();
const mockTenantContextRun = jest.fn((store, cb) => cb());
jest.mock('../db', () => ({
  rawPool: { query: (...args) => mockQuery(...args) },
  tenantContext: { run: (...args) => mockTenantContextRun(...args) },
}));

// Mock the checkPermission module (re-exported by auth.js)
jest.mock('../middleware/checkPermission', () => ({
  checkPermission: jest.fn(() => (req, res, next) => next()),
  checkAllPermissions: jest.fn(() => (req, res, next) => next()),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  requireOwnershipOrAdmin,
  requireActiveAccount,
  authenticateApiKey,
} = require('../middleware/auth');

/**
 * Build a minimal Express-compatible mock request.
 */
function mockReq(overrides = {}) {
  return {
    headers: {},
    ...overrides,
  };
}

/**
 * Build a minimal Express-compatible mock response.
 */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Collect the error (if any) passed to next().
 * Returns a promise that resolves to { error, called }.
 */
function callMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    const next = (err) => resolve({ error: err || null, called: true });
    try {
      const result = middleware(req, res, next);
      // Handle async middleware
      if (result && typeof result.then === 'function') {
        result.catch((e) => resolve({ error: e, called: false }));
      }
    } catch (syncErr) {
      resolve({ error: syncErr, called: false });
    }
  });
}

// ── Shared fixtures ────────────────────────────────────────────────────────────

const DECODED_TOKEN = { userId: 42, email: 'test@example.com', role: 'user', type: 'access' };

const DB_USER_ROW = {
  id: 42,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  is_active: true,
  pos_role_id: null,
  role_id: null,
  tenant_id: 'tenant-1',
  pos_permissions: null,
  pos_role_name: null,
  role_name: null,
  role_display_name: null,
};

const _DB_ADMIN_ROW = {
  ...DB_USER_ROW,
  role: 'admin',
  role_id: 1,
  role_name: 'admin',
  role_display_name: 'Administrator',
};

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// authenticate
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticate', () => {
  test('should reject request with no Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/no token provided/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject request with non-Bearer Authorization header', async () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid token format/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject request with "Bearer " but empty token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer ' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/no token provided/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when verifyAccessToken throws (expired token)', async () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('Access token has expired');
    });

    const req = mockReq({ headers: { authorization: 'Bearer expired.token.here' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/expired/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when verifyAccessToken throws (invalid token)', async () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('Invalid access token');
    });

    const req = mockReq({ headers: { authorization: 'Bearer bad.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when user is not found in database', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/user not found/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when user account is inactive', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...DB_USER_ROW, is_active: false }] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/deactivated/i);
    expect(error.statusCode).toBe(403);
  });

  test('should set req.user and req.token on valid token + active user', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [DB_USER_ROW] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(42);
    expect(req.user.email).toBe('test@example.com');
    expect(req.user.firstName).toBe('Test');
    expect(req.user.lastName).toBe('User');
    expect(req.user.role).toBe('user');
    expect(req.user.isActive).toBe(true);
    expect(req.user.tenantId).toBe('tenant-1');
    expect(req.token).toBe(DECODED_TOKEN);
  });

  test('should call tenantContext.run with the tenant ID', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [DB_USER_ROW] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(authenticate, req, res);

    expect(mockTenantContextRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.any(Function)
    );
  });

  test('should call next without tenant context when tenant_id is null', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...DB_USER_ROW, tenant_id: null }],
    });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error, called } = await callMiddleware(authenticate, req, res);

    expect(error).toBeNull();
    expect(called).toBe(true);
    // tenantContext.run should NOT have been called when tenantId is null
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  test('should load normalized permissions when role_id is present', async () => {
    const userWithRole = { ...DB_USER_ROW, role_id: 5 };
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery
      .mockResolvedValueOnce({ rows: [userWithRole] })
      .mockResolvedValueOnce({ rows: [{ code: 'hub.orders.view' }, { code: 'hub.orders.edit' }] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(authenticate, req, res);

    expect(req.user.permissions).toEqual(['hub.orders.view', 'hub.orders.edit']);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('should fall back to null permissions if permission table query fails', async () => {
    const userWithRole = { ...DB_USER_ROW, role_id: 5 };
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery
      .mockResolvedValueOnce({ rows: [userWithRole] })
      .mockRejectedValueOnce(new Error('relation "permissions" does not exist'));

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).toBeNull();
    expect(req.user.permissions).toBeNull();
  });

  test('should set posPermissions when pos_permissions is an array', async () => {
    const userWithPosPerms = {
      ...DB_USER_ROW,
      pos_permissions: ['pos.checkout.create', 'pos.drawer.open'],
    };
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [userWithPosPerms] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(authenticate, req, res);

    expect(req.user.posPermissions).toEqual(['pos.checkout.create', 'pos.drawer.open']);
  });

  test('should set posPermissions to null when pos_permissions is not an array', async () => {
    const userWithStringPerms = { ...DB_USER_ROW, pos_permissions: 'not-an-array' };
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [userWithStringPerms] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(authenticate, req, res);

    expect(req.user.posPermissions).toBeNull();
  });

  test('should pass error to next when database query fails unexpectedly', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticate, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toBe('connection refused');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// optionalAuth
// ═══════════════════════════════════════════════════════════════════════════════

describe('optionalAuth', () => {
  test('should set req.user to null and call next when no Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const { error, called } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(called).toBe(true);
    expect(req.user).toBeNull();
  });

  test('should set req.user to null when Authorization is not Bearer', async () => {
    const req = mockReq({ headers: { authorization: 'Basic abc' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });

  test('should set req.user to null when Bearer token is empty', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer ' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });

  test('should set req.user to null when token verification fails', async () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('Invalid access token');
    });

    const req = mockReq({ headers: { authorization: 'Bearer bad.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });

  test('should set req.user to null when user not found in database', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });

  test('should set req.user to null when user is inactive', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...DB_USER_ROW, is_active: false }] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });

  test('should populate req.user when token is valid and user is active', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [DB_USER_ROW] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error } = await callMiddleware(optionalAuth, req, res);

    expect(error).toBeNull();
    expect(req.user).not.toBeNull();
    expect(req.user.id).toBe(42);
    expect(req.user.email).toBe('test@example.com');
    expect(req.token).toBe(DECODED_TOKEN);
  });

  test('should run tenant context when user is authenticated', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockResolvedValueOnce({ rows: [DB_USER_ROW] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(optionalAuth, req, res);

    expect(mockTenantContextRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.any(Function)
    );
  });

  test('should load normalized permissions when role_id is present', async () => {
    const userWithRole = { ...DB_USER_ROW, role_id: 5 };
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery
      .mockResolvedValueOnce({ rows: [userWithRole] })
      .mockResolvedValueOnce({ rows: [{ code: 'hub.orders.view' }] });

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    await callMiddleware(optionalAuth, req, res);

    expect(req.user.permissions).toEqual(['hub.orders.view']);
  });

  test('should still call next (not error) if database throws during optional auth', async () => {
    mockVerifyAccessToken.mockReturnValue(DECODED_TOKEN);
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const { error, called } = await callMiddleware(optionalAuth, req, res);

    // optionalAuth should swallow errors and still call next
    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.user).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requireRole
// ═══════════════════════════════════════════════════════════════════════════════

describe('requireRole', () => {
  test('should throw unauthorized when req.user is not set', () => {
    const middleware = requireRole('admin');
    const req = mockReq();
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/authentication required/i);
  });

  test('should allow access when user role matches allowed role', async () => {
    const middleware = requireRole('admin');
    const req = mockReq({
      user: { role: 'admin', email: 'admin@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should be case-insensitive for role matching', async () => {
    const middleware = requireRole('Admin');
    const req = mockReq({
      user: { role: 'admin', email: 'admin@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow access when user posRoleName matches', async () => {
    const middleware = requireRole('manager');
    const req = mockReq({
      user: { role: 'user', posRoleName: 'Manager', email: 'mgr@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow access when user roleName matches', async () => {
    const middleware = requireRole('manager');
    const req = mockReq({
      user: { role: 'user', roleName: 'manager', email: 'mgr@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow access when any of multiple allowed roles matches', async () => {
    const middleware = requireRole('admin', 'manager');
    const req = mockReq({
      user: { role: 'manager', email: 'mgr@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should deny access when user role does not match any allowed role', () => {
    const middleware = requireRole('admin', 'manager');
    const req = mockReq({
      user: { role: 'user', email: 'user@example.com' },
    });
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/insufficient permissions/i);
  });

  test('should allow access via manager permissions when requiring admin/manager', async () => {
    // User has override + void permissions, which grants manager-level access
    const middleware = requireRole('admin');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        posPermissions: ['pos.checkout.price_override', 'pos.checkout.void'],
      },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should deny when requiring non-admin/manager role without role match', () => {
    const middleware = requireRole('cashier');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        posPermissions: ['pos.checkout.price_override', 'pos.checkout.void'],
      },
    });
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/insufficient permissions/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requirePermission
// ═══════════════════════════════════════════════════════════════════════════════

describe('requirePermission', () => {
  test('should throw unauthorized when req.user is not set', () => {
    const middleware = requirePermission('pos.checkout.create');
    const req = mockReq();
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/authentication required/i);
  });

  test('should bypass permission check for admin role', async () => {
    const middleware = requirePermission('pos.checkout.void');
    const req = mockReq({
      user: { role: 'admin', email: 'admin@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should bypass permission check for admin roleName', async () => {
    const middleware = requirePermission('pos.checkout.void');
    const req = mockReq({
      user: { role: 'user', roleName: 'admin', email: 'admin@example.com' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow when user has the required permission', async () => {
    const middleware = requirePermission('pos.checkout.create');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        permissions: ['pos.checkout.create', 'pos.drawer.open'],
      },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow when user has any one of multiple required permissions (OR logic)', async () => {
    const middleware = requirePermission('pos.checkout.void', 'pos.returns.create');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        permissions: ['pos.returns.create'],
      },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should deny when user lacks the required permission', () => {
    const middleware = requirePermission('pos.checkout.void');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        id: 1,
        permissions: ['pos.checkout.create'],
      },
    });
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/insufficient permissions/i);
  });

  test('should use posPermissions fallback when permissions array is empty', async () => {
    const middleware = requirePermission('pos.checkout.create');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        permissions: [],
        posPermissions: ['pos.checkout.create'],
      },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should use fallback role permissions when no explicit permissions exist', async () => {
    const middleware = requirePermission('pos.checkout.create');
    const req = mockReq({
      user: {
        role: 'user',
        email: 'user@example.com',
        // No permissions or posPermissions -- falls back to FALLBACK_ROLE_PERMISSIONS.user
      },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    // 'pos.checkout.create' is in the user fallback set
    expect(error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requireOwnershipOrAdmin
// ═══════════════════════════════════════════════════════════════════════════════

describe('requireOwnershipOrAdmin', () => {
  const getOwnerId = (req) => req.params.userId;

  test('should throw unauthorized when req.user is not set', () => {
    const middleware = requireOwnershipOrAdmin(getOwnerId);
    const req = mockReq({ params: { userId: '42' } });
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/authentication required/i);
  });

  test('should allow access when user is the resource owner', async () => {
    const middleware = requireOwnershipOrAdmin(getOwnerId);
    const req = mockReq({
      user: { id: 42, role: 'user' },
      params: { userId: '42' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should allow access when user is admin (even if not owner)', async () => {
    const middleware = requireOwnershipOrAdmin(getOwnerId);
    const req = mockReq({
      user: { id: 99, role: 'admin' },
      params: { userId: '42' },
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });

  test('should deny access when user is not owner and not admin', () => {
    const middleware = requireOwnershipOrAdmin(getOwnerId);
    const req = mockReq({
      user: { id: 99, role: 'user' },
      params: { userId: '42' },
    });
    const res = mockRes();

    expect(() => {
      middleware(req, res, jest.fn());
    }).toThrow(/you can only access your own resources/i);
  });

  test('should compare owner ID as strings (handles numeric vs string mismatch)', async () => {
    const middleware = requireOwnershipOrAdmin(getOwnerId);
    const req = mockReq({
      user: { id: 42, role: 'user' }, // numeric
      params: { userId: '42' },        // string
    });
    const res = mockRes();
    const { error } = await callMiddleware(middleware, req, res);

    expect(error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requireActiveAccount
// ═══════════════════════════════════════════════════════════════════════════════

describe('requireActiveAccount', () => {
  test('should throw unauthorized when req.user is not set', () => {
    const req = mockReq();
    const res = mockRes();

    expect(() => {
      requireActiveAccount(req, res, jest.fn());
    }).toThrow(/authentication required/i);
  });

  test('should throw when account is inactive', () => {
    const req = mockReq({ user: { isActive: false } });
    const res = mockRes();

    expect(() => {
      requireActiveAccount(req, res, jest.fn());
    }).toThrow(/deactivated/i);
  });

  test('should call next when account is active', async () => {
    const req = mockReq({ user: { isActive: true } });
    const res = mockRes();
    const { error } = await callMiddleware(requireActiveAccount, req, res);

    expect(error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// authenticateApiKey
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticateApiKey', () => {
  const VALID_API_KEY = 'a'.repeat(64);

  const API_KEY_DB_ROW = {
    id: 10,
    user_id: 42,
    email: 'api@example.com',
    first_name: 'API',
    last_name: 'User',
    role: 'user',
    is_active: true,
    tenant_id: 'tenant-1',
    expires_at: null,
  };

  test('should reject when no X-API-Key header is provided', async () => {
    const req = mockReq();
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/api key required/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when API key is too short (< 32 chars)', async () => {
    const req = mockReq({ headers: { 'x-api-key': 'short' } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid api key/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when API key is too long (> 128 chars)', async () => {
    const req = mockReq({ headers: { 'x-api-key': 'x'.repeat(129) } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid api key/i);
  });

  test('should reject when API key is not a string', async () => {
    const req = mockReq({ headers: { 'x-api-key': 12345 } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid api key/i);
  });

  test('should reject when API key is not found in database', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid api key/i);
    expect(error.statusCode).toBe(401);
  });

  test('should reject when API key has expired', async () => {
    const expiredRow = { ...API_KEY_DB_ROW, expires_at: '2020-01-01T00:00:00Z' };
    mockQuery.mockResolvedValueOnce({ rows: [expiredRow] });

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/expired/i);
    expect(error.statusCode).toBe(401);
  });

  test('should authenticate successfully with valid API key', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [API_KEY_DB_ROW] }) // SELECT api_keys
      .mockResolvedValueOnce({ rows: [] });               // UPDATE last_used_at

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(42);
    expect(req.user.email).toBe('api@example.com');
    expect(req.user.authMethod).toBe('api_key');
    expect(req.user.tenantId).toBe('tenant-1');
  });

  test('should update last_used_at on successful authentication', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [API_KEY_DB_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    await callMiddleware(authenticateApiKey, req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE api_keys SET last_used_at/);
    expect(mockQuery.mock.calls[1][1]).toEqual([API_KEY_DB_ROW.id]);
  });

  test('should call tenantContext.run with tenant ID on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [API_KEY_DB_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    await callMiddleware(authenticateApiKey, req, res);

    expect(mockTenantContextRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.any(Function)
    );
  });

  test('should allow non-expired API key with future expiration', async () => {
    const futureRow = { ...API_KEY_DB_ROW, expires_at: '2099-12-31T23:59:59Z' };
    mockQuery
      .mockResolvedValueOnce({ rows: [futureRow] })
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).toBeNull();
    expect(req.user).toBeDefined();
  });

  test('should pass error to next when database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const req = mockReq({ headers: { 'x-api-key': VALID_API_KEY } });
    const res = mockRes();
    const { error } = await callMiddleware(authenticateApiKey, req, res);

    expect(error).not.toBeNull();
    expect(error.message).toBe('DB down');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Module exports verification
// ═══════════════════════════════════════════════════════════════════════════════

describe('module exports', () => {
  test('should export all expected middleware functions', () => {
    const auth = require('../middleware/auth');

    expect(typeof auth.authenticate).toBe('function');
    expect(typeof auth.optionalAuth).toBe('function');
    expect(typeof auth.requireRole).toBe('function');
    expect(typeof auth.requirePermission).toBe('function');
    expect(typeof auth.requireOwnershipOrAdmin).toBe('function');
    expect(typeof auth.requireActiveAccount).toBe('function');
    expect(typeof auth.authenticateApiKey).toBe('function');
    expect(typeof auth.checkPermission).toBe('function');
    expect(typeof auth.checkAllPermissions).toBe('function');
  });

  test('requireRole should return a middleware function', () => {
    const middleware = requireRole('admin');
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // (req, res, next)
  });

  test('requirePermission should return a middleware function', () => {
    const middleware = requirePermission('pos.checkout.void');
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3);
  });

  test('requireOwnershipOrAdmin should return a middleware function', () => {
    const middleware = requireOwnershipOrAdmin((req) => req.params.id);
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3);
  });
});
