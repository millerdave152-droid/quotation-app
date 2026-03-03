/**
 * Unit tests for backend/middleware/checkPermission.js
 *
 * Tests:
 *   - checkPermission (OR logic)
 *   - checkAllPermissions (AND logic)
 *   - getUserPermissions (DB lookup + cache)
 *   - invalidateUserPermissionCache
 *   - Admin bypass (admin.* wildcard, role-based)
 *   - 401/403 error responses
 *   - Error propagation via next()
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    user: { id: 1, role: 'user', roleName: 'user' },
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function callMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    const next = jest.fn((err) => resolve({ error: err || null, next }));
    const result = middleware(req, res, next);
    if (result && typeof result.then === 'function') {
      result.then(() => resolve({ error: null, next })).catch((e) => resolve({ error: e, next }));
    }
  });
}

// ── Import SUT ─────────────────────────────────────────────────────────────────

const {
  checkPermission,
  checkAllPermissions,
  getUserPermissions,
  invalidateUserPermissionCache,
} = require('../middleware/checkPermission');

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Always invalidate the entire cache between tests
  invalidateUserPermissionCache();
});

// ============================================================================
// getUserPermissions
// ============================================================================

describe('getUserPermissions', () => {
  it('should fetch permissions from DB for a user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.view' }, { code: 'hub.orders.edit' }],
    });

    const perms = await getUserPermissions(42);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT p.code'),
      [42]
    );
    expect(perms).toEqual(['hub.orders.view', 'hub.orders.edit']);
  });

  it('should return cached permissions within TTL', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.view' }],
    });

    const first = await getUserPermissions(7);
    const second = await getUserPermissions(7);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('should re-fetch after cache is invalidated for specific user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'perm.a' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'perm.b' }] });

    const first = await getUserPermissions(10);
    invalidateUserPermissionCache(10);
    const second = await getUserPermissions(10);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(first).toEqual(['perm.a']);
    expect(second).toEqual(['perm.b']);
  });

  it('should re-fetch after global cache invalidation (no userId)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'perm.x' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'perm.y' }] });

    await getUserPermissions(20);
    invalidateUserPermissionCache(); // global clear
    const result = await getUserPermissions(20);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(result).toEqual(['perm.y']);
  });

  it('should return empty array when user has no permissions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const perms = await getUserPermissions(99);
    expect(perms).toEqual([]);
  });

  it('should propagate DB errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(getUserPermissions(1)).rejects.toThrow('DB connection lost');
  });
});

// ============================================================================
// invalidateUserPermissionCache
// ============================================================================

describe('invalidateUserPermissionCache', () => {
  it('should clear cache for a specific user without affecting others', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'perm.a' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'perm.b' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'perm.c' }] });

    await getUserPermissions(1);
    await getUserPermissions(2);

    invalidateUserPermissionCache(1);

    // User 1 should re-fetch
    await getUserPermissions(1);
    // User 2 should still be cached
    await getUserPermissions(2);

    // 2 initial + 1 re-fetch for user 1 = 3
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('should clear all cached users when called without arguments', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'a' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'b' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'c' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'd' }] });

    await getUserPermissions(1);
    await getUserPermissions(2);

    invalidateUserPermissionCache();

    await getUserPermissions(1);
    await getUserPermissions(2);

    // 2 initial + 2 re-fetch = 4
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });
});

// ============================================================================
// checkPermission (OR logic)
// ============================================================================

describe('checkPermission', () => {
  it('should return a middleware function', () => {
    const middleware = checkPermission('hub.orders.view');
    expect(typeof middleware).toBe('function');
  });

  it('should return 401 when req.user is not set', async () => {
    const middleware = checkPermission('hub.orders.view');
    const req = { user: undefined };
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      })
    );
  });

  it('should return 401 when req.user is null', async () => {
    const middleware = checkPermission('hub.orders.view');
    const req = { user: null };
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should call next() when user has the required permission', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.view' }, { code: 'hub.orders.edit' }],
    });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() when user has ANY of multiple required permissions (OR logic)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.edit' }],
    });

    const middleware = checkPermission('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
  });

  it('should return 403 when user lacks all required permissions', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.products.view' }],
    });

    const middleware = checkPermission('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Forbidden',
        message: expect.stringContaining('hub.orders.view'),
      })
    );
  });

  it('should include required_permission as string for single permission', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.required_permission).toBe('hub.orders.view');
  });

  it('should include required_permission as array for multiple permissions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const middleware = checkPermission('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.required_permission).toEqual(['hub.orders.view', 'hub.orders.edit']);
  });

  // ── Admin bypass ─────────────────────────────────────────────────────────

  it('should bypass permission check for admin.* wildcard permission', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'admin.*' }],
    });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should bypass permission check for * wildcard permission', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: '*' }],
    });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
  });

  it('should bypass permission check when req.user.role is admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'some.other.perm' }],
    });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq({ user: { id: 1, role: 'admin' } });
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
  });

  it('should bypass permission check when req.user.roleName is admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'some.other.perm' }],
    });

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq({ user: { id: 1, role: 'user', roleName: 'admin' } });
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('should call next(error) when DB query fails', async () => {
    const dbError = new Error('Connection timeout');
    mockQuery.mockRejectedValueOnce(dbError);

    const middleware = checkPermission('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    const { error, next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(error).toBe(dbError);
  });
});

// ============================================================================
// checkAllPermissions (AND logic)
// ============================================================================

describe('checkAllPermissions', () => {
  it('should return a middleware function', () => {
    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    expect(typeof middleware).toBe('function');
  });

  it('should return 401 when req.user is not set', async () => {
    const middleware = checkAllPermissions('hub.orders.view');
    const req = { user: undefined };
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Unauthorized',
      })
    );
  });

  it('should call next() when user has ALL required permissions', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { code: 'hub.orders.view' },
        { code: 'hub.orders.edit' },
        { code: 'hub.orders.delete' },
      ],
    });

    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user is missing some permissions', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.view' }],
    });

    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit', 'hub.orders.delete');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');
    expect(body.missing_permissions).toEqual(
      expect.arrayContaining(['hub.orders.edit', 'hub.orders.delete'])
    );
    expect(body.required_permissions).toEqual([
      'hub.orders.view',
      'hub.orders.edit',
      'hub.orders.delete',
    ]);
  });

  it('should return 403 when user has NONE of the required permissions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.missing_permissions).toEqual(['hub.orders.view', 'hub.orders.edit']);
  });

  it('should include missing permissions in the error message', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'hub.orders.view' }],
    });

    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    const req = mockReq();
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain('hub.orders.edit');
  });

  // ── Admin bypass ─────────────────────────────────────────────────────────

  it('should bypass all permission checks when req.user.role is admin', async () => {
    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    const req = mockReq({ user: { id: 1, role: 'admin' } });
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should bypass all permission checks when req.user.roleName is admin', async () => {
    const middleware = checkAllPermissions('hub.orders.view', 'hub.orders.edit');
    const req = mockReq({ user: { id: 1, role: 'user', roleName: 'admin' } });
    const res = mockRes();

    const { next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('should call next(error) when DB query fails', async () => {
    const dbError = new Error('Query failed');
    mockQuery.mockRejectedValueOnce(dbError);

    const middleware = checkAllPermissions('hub.orders.view');
    const req = mockReq();
    const res = mockRes();

    const { error, next } = await callMiddleware(middleware, req, res);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(error).toBe(dbError);
  });
});

// ============================================================================
// Cache TTL behavior
// ============================================================================

describe('cache TTL behavior', () => {
  it('should re-fetch from DB after cache TTL expires', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'perm.old' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'perm.new' }] });

    const originalDateNow = Date.now;
    let currentTime = 1000000;
    Date.now = jest.fn(() => currentTime);

    try {
      const first = await getUserPermissions(50);
      expect(first).toEqual(['perm.old']);

      // Advance time past 30s TTL
      currentTime += 31_000;

      const second = await getUserPermissions(50);
      expect(second).toEqual(['perm.new']);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('should use cache within TTL window', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ code: 'perm.cached' }] });

    const originalDateNow = Date.now;
    let currentTime = 1000000;
    Date.now = jest.fn(() => currentTime);

    try {
      await getUserPermissions(51);

      // Advance time but still within 30s TTL
      currentTime += 29_000;

      const second = await getUserPermissions(51);
      expect(second).toEqual(['perm.cached']);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = originalDateNow;
    }
  });
});
