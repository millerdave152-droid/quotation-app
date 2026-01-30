/**
 * Authentication Middleware
 * Handles JWT token verification and role-based access control
 * @module middleware/auth
 */

const { verifyAccessToken } = require('../utils/jwt');
const db = require('../config/database');

/**
 * Authenticate Middleware
 * Verifies JWT token from Authorization header and attaches user to request
 * Expects header format: "Authorization: Bearer <token>"
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Check if header follows "Bearer <token>" format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Expected "Bearer <token>"'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Invalid or expired token'
      });
    }

    // Fetch user from database to ensure they still exist and are active
    const result = await db.query(
      'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
    }

    const user = result.rows[0];

    // Check if user account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact administrator.'
      });
    }

    // Attach user information to request object
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active
    };

    // Attach decoded token for additional context
    req.token = decoded;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 * Useful for routes that have different behavior for authenticated vs anonymous users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // If no token, continue without authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      req.user = null;
      return next();
    }

    // Try to verify token
    try {
      const decoded = verifyAccessToken(token);

      // Fetch user from database
      const result = await db.query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length > 0 && result.rows[0].is_active) {
        const user = result.rows[0];
        req.user = {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active
        };
        req.token = decoded;
      } else {
        req.user = null;
      }
    } catch (error) {
      // Token invalid or expired, continue without authentication
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
 * @example
 * router.get('/admin', authenticate, requireRole('admin'), handler);
 * router.get('/staff', authenticate, requireRole('admin', 'manager'), handler);
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Check if user has required role (case-insensitive comparison)
      const userRole = req.user.role?.toLowerCase();
      const hasRole = allowedRoles.some(role => role.toLowerCase() === userRole);

      if (!hasRole) {
        console.warn(
          `Access denied for user ${req.user.email} (role: ${req.user.role}). Required roles: ${allowedRoles.join(', ')}`
        );

        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
          requiredRoles: allowedRoles,
          userRole: req.user.role
        });
      }

      next();
    } catch (error) {
      console.error('Role authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Require Ownership or Admin Middleware Factory
 * Checks if user owns the resource or is an admin
 * @param {Function} getResourceOwnerId - Function that extracts owner ID from request
 * @returns {Function} Express middleware function
 * @example
 * router.put('/users/:id', authenticate,
 *   requireOwnershipOrAdmin(req => req.params.id),
 *   handler
 * );
 */
const requireOwnershipOrAdmin = (getResourceOwnerId) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const resourceOwnerId = getResourceOwnerId(req);
      const isOwner = String(req.user.id) === String(resourceOwnerId);
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own resources.'
        });
      }

      next();
    } catch (error) {
      console.error('Ownership authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Require Active Account Middleware
 * Ensures user account is active (useful as additional check)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireActiveAccount = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (!req.user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Account is inactive. Please contact administrator.'
    });
  }

  next();
};

/**
 * API Key Authentication Middleware
 * Alternative authentication method using API keys
 * Expects header: "X-API-Key: <api_key>"
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Fetch API key from database
    const result = await db.query(
      `SELECT ak.*, u.id as user_id, u.email, u.first_name, u.last_name, u.role, u.is_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_value = $1 AND ak.is_active = true AND u.is_active = true`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    const keyData = result.rows[0];

    // Check expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'API key has expired'
      });
    }

    // Update last used timestamp
    await db.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [keyData.id]
    );

    // Attach user to request
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
    console.error('API key authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requireOwnershipOrAdmin,
  requireActiveAccount,
  authenticateApiKey
};
