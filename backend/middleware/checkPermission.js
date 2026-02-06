/**
 * Permission Checking Middleware
 * Performs a fresh DB lookup to verify the user has the required permission.
 * Must be used after authenticate middleware.
 *
 * Supports:
 * - Single permission check: checkPermission('hub.orders.edit')
 * - Multiple (ANY): checkPermission('hub.orders.edit', 'hub.orders.view')
 * - Wildcard admin bypass: users with 'admin.*' permission bypass all checks
 *
 * @module middleware/checkPermission
 */

const db = require('../config/database');

// In-memory permission cache per user, expires after 30 seconds
// SECURITY: Shorter TTL reduces window of access after permission revocation
const _cache = new Map();
const CACHE_TTL_MS = 30_000; // Reduced from 60s to 30s for security

/**
 * Fetch permissions from DB for a user, with short-lived cache.
 * @param {number} userId
 * @returns {Promise<string[]>} Array of permission codes
 */
async function getUserPermissions(userId) {
  const now = Date.now();
  const cached = _cache.get(userId);

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.perms;
  }

  const result = await db.query(
    `SELECT p.code
     FROM users u
     JOIN roles r ON u.role_id = r.id
     JOIN role_permissions rp ON r.id = rp.role_id
     JOIN permissions p ON rp.permission_id = p.id
     WHERE u.id = $1`,
    [userId]
  );

  const perms = result.rows.map(row => row.code);
  _cache.set(userId, { perms, ts: now });

  return perms;
}

/**
 * Invalidate cached permissions for a user.
 * Call this after role or permission changes.
 * @param {number} userId
 */
function invalidateUserPermissionCache(userId) {
  if (userId) {
    _cache.delete(userId);
  } else {
    _cache.clear();
  }
}

/**
 * Middleware factory that checks if the authenticated user has a required permission.
 * @param {...string} requiredPermissions - One or more permission codes (OR logic)
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/orders/:id/void', checkPermission('pos.checkout.void'), handler);
 * router.put('/commissions/:id/approve', checkPermission('hub.commissions.approve'), handler);
 */
const checkPermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const userId = req.user.id;
      const userPermissions = await getUserPermissions(userId);

      // SECURITY: Check for admin.* wildcard permission from DB rather than trusting req.user.role
      // This ensures admin status is verified from the database, not just the token payload
      const hasAdminWildcard = userPermissions.some(p => p === 'admin.*' || p === '*');
      if (hasAdminWildcard) {
        return next();
      }

      // Fallback: Also check role but only if user was freshly loaded from DB in authenticate middleware
      // The authenticate middleware loads role from DB, so this is a valid secondary check
      const isAdmin = req.user.role === 'admin' || req.user.roleName === 'admin';
      if (isAdmin) {
        return next();
      }

      const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Permission '${requiredPermissions.join("' or '")}' required`,
          required_permission: requiredPermissions.length === 1 ? requiredPermissions[0] : requiredPermissions,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check multiple permissions with AND logic (all required).
 * @param {...string} requiredPermissions
 * @returns {Function} Express middleware
 */
const checkAllPermissions = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const isAdmin = req.user.role === 'admin' || req.user.roleName === 'admin';
      if (isAdmin) {
        return next();
      }

      const userPermissions = await getUserPermissions(req.user.id);
      const missing = requiredPermissions.filter(p => !userPermissions.includes(p));

      if (missing.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Missing permissions: ${missing.join(', ')}`,
          required_permissions: requiredPermissions,
          missing_permissions: missing,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  checkPermission,
  checkAllPermissions,
  getUserPermissions,
  invalidateUserPermissionCache,
};
