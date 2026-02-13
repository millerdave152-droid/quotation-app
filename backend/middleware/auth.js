/**
 * Authentication Middleware
 * Handles JWT token verification and role-based access control
 * @module middleware/auth
 */

const { verifyAccessToken } = require('../utils/jwt');
const db = require('../config/database');
const { resolvePermissions, hasPermission: checkPermission, POS_PERMISSIONS } = require('../utils/permissions');
const { ApiError } = require('./errorHandler');

/**
 * Authenticate Middleware
 * Verifies JWT token from Authorization header and attaches user to request
 * Expects header format: "Authorization: Bearer <token>"
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw ApiError.unauthorized('Access denied. No token provided.');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Invalid token format. Expected "Bearer <token>"');
    }

    const token = authHeader.substring(7);

    if (!token) {
      throw ApiError.unauthorized('Access denied. No token provided.');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      throw ApiError.unauthorized(error.message || 'Invalid or expired token');
    }

    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
              u.pos_role_id, u.role_id,
              pr.permissions as pos_permissions, pr.name as pos_role_name,
              r.name as role_name, r.display_name as role_display_name
       FROM users u
       LEFT JOIN pos_roles pr ON u.pos_role_id = pr.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.unauthorized('User not found. Token is invalid.');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw ApiError.accountInactive();
    }

    // Load normalized permissions from role_permissions if role_id is set
    let normalizedPermissions = null;
    if (user.role_id) {
      try {
        const permResult = await db.query(
          `SELECT p.code FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           WHERE rp.role_id = $1`,
          [user.role_id]
        );
        normalizedPermissions = permResult.rows.map(r => r.code);
      } catch (err) {
        // Tables may not exist yet -- fall back silently
        normalizedPermissions = null;
      }
    }

    const posPermissions = user.pos_permissions || null;
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      posRoleId: user.pos_role_id,
      posRoleName: user.pos_role_name,
      posPermissions: Array.isArray(posPermissions) ? posPermissions : null,
      roleId: user.role_id,
      roleName: user.role_name,
      roleDisplayName: user.role_display_name,
      permissions: normalizedPermissions,
    };

    req.token = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional Authentication Middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = verifyAccessToken(token);

      const result = await db.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
                u.pos_role_id, u.role_id,
                pr.permissions as pos_permissions, pr.name as pos_role_name,
                r.name as role_name, r.display_name as role_display_name
         FROM users u
         LEFT JOIN pos_roles pr ON u.pos_role_id = pr.id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [decoded.userId]
      );

      if (result.rows.length > 0 && result.rows[0].is_active) {
        const user = result.rows[0];

        let normalizedPermissions = null;
        if (user.role_id) {
          try {
            const permResult = await db.query(
              `SELECT p.code FROM permissions p
               JOIN role_permissions rp ON rp.permission_id = p.id
               WHERE rp.role_id = $1`,
              [user.role_id]
            );
            normalizedPermissions = permResult.rows.map(r => r.code);
          } catch (err) {
            normalizedPermissions = null;
          }
        }

        const posPermissions = user.pos_permissions || null;
        req.user = {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          posRoleId: user.pos_role_id,
          posRoleName: user.pos_role_name,
          posPermissions: Array.isArray(posPermissions) ? posPermissions : null,
          roleId: user.role_id,
          roleName: user.role_name,
          roleDisplayName: user.role_display_name,
          permissions: normalizedPermissions,
        };
        req.token = decoded;
      } else {
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

/**
 * Require Role Middleware Factory
 * Creates middleware that checks if authenticated user has required role(s)
 * Must be used after authenticate middleware
 * @param {...string} allowedRoles - Role(s) that are allowed to access the route
 * @returns {Function} Express middleware function
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const allowed = allowedRoles.map(r => r.toLowerCase());
    const roleCandidates = [
      req.user.role,
      req.user.posRoleName,
      req.user.roleName,
    ]
      .filter(Boolean)
      .map(r => r.toLowerCase());
    const hasRole = roleCandidates.some(r => allowed.includes(r));
    const perms = resolvePermissions(req.user);
    const hasManagerPerms = perms.includes(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE)
      && perms.includes(POS_PERMISSIONS.CHECKOUT_VOID);
    const hasAdminOrManagerPerms = allowed.includes('admin') || allowed.includes('manager')
      ? hasManagerPerms
      : false;

    if (!hasRole && !hasAdminOrManagerPerms) {
      console.warn(
        `Access denied for user ${req.user.email} (role: ${req.user.role}, posRole: ${req.user.posRoleName}, roleName: ${req.user.roleName}). Required roles: ${allowedRoles.join(', ')}`
      );
      throw ApiError.forbidden('Access denied. Insufficient permissions.');
    }

    next();
  };
};

/**
 * Require Ownership or Admin Middleware Factory
 * Checks if user owns the resource or is an admin
 * @param {Function} getResourceOwnerId - Function that extracts owner ID from request
 * @returns {Function} Express middleware function
 */
const requireOwnershipOrAdmin = (getResourceOwnerId) => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const resourceOwnerId = getResourceOwnerId(req);
    const isOwner = String(req.user.id) === String(resourceOwnerId);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('Access denied. You can only access your own resources.');
    }

    next();
  };
};

/**
 * Require Active Account Middleware
 * Ensures user account is active (useful as additional check)
 */
const requireActiveAccount = (req, res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  if (!req.user.isActive) {
    throw ApiError.accountInactive();
  }

  next();
};

/**
 * API Key Authentication Middleware
 * Alternative authentication method using API keys
 * Expects header: "X-API-Key: <api_key>"
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      throw ApiError.unauthorized('API key required');
    }

    if (typeof apiKey !== 'string' || apiKey.length < 32 || apiKey.length > 128) {
      throw ApiError.unauthorized('Invalid API key');
    }

    const result = await db.query(
      `SELECT ak.*, u.id as user_id, u.email, u.first_name, u.last_name, u.role, u.is_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_value = $1 AND ak.is_active = true AND u.is_active = true`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      throw ApiError.unauthorized('Invalid API key');
    }

    const keyData = result.rows[0];

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      throw ApiError.unauthorized('API key has expired');
    }

    await db.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [keyData.id]
    );

    req.user = {
      id: keyData.user_id,
      email: keyData.email,
      firstName: keyData.first_name,
      lastName: keyData.last_name,
      role: keyData.role,
      isActive: keyData.is_active,
      authMethod: 'api_key'
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require Permission Middleware Factory
 * Checks if authenticated user has a specific POS permission.
 * @param {...string} requiredPermissions - Permission(s) the user must have (ANY match grants access)
 * @returns {Function} Express middleware function
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const userPerms = resolvePermissions(req.user);
    const hasAny = requiredPermissions.some(p => userPerms.includes(p));

    if (!hasAny) {
      console.warn(
        `Permission denied for user ${req.user.id}. Required: ${requiredPermissions.join(' | ')}`
      );
      throw ApiError.forbidden('Access denied. Insufficient permissions.');
    }

    next();
  };
};

// Re-export DB-backed permission check for convenience
const { checkPermission: checkDbPermission, checkAllPermissions } = require('./checkPermission');

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  checkPermission: checkDbPermission,
  checkAllPermissions,
  requireOwnershipOrAdmin,
  requireActiveAccount,
  authenticateApiKey
};
