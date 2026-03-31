/**
 * Authentication Routes
 * Handles user authentication, registration, and session management
 * @module routes/auth
 */

const express = require('express');
const router = express.Router();
const { rawPool: db } = require('../db'); // Use rawPool — login/register bypass RLS
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, REFRESH_TOKEN_EXPIRY } = require('../utils/jwt');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateRefreshToken,
} = require('../middleware/validation');
const { authLimiter } = require('../middleware/security');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { auditLogMiddleware } = require('../middleware/auditLog');
const crypto = require('crypto');

// ── Helpers ─────────────────────────────────────────────────────────────
/**
 * Parse a duration string like '7d', '24h', '30m' into milliseconds.
 * Falls back to 7 days if unrecognised.
 */
function parseDurationMs(str) {
  const match = String(str).match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (multipliers[unit] || 86400000);
}

const REFRESH_TTL_MS = parseDurationMs(REFRESH_TOKEN_EXPIRY);

/**
 * Hash a refresh token for storage (SHA-256).
 * The raw token is returned to the client; only the hash is stored in the DB.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Store a refresh token hash in the database with session metadata.
 * @returns {number} The inserted token row id
 */
async function storeRefreshToken(client, { userId, token, familyId, ip, userAgent }) {
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const tokenHash = hashToken(token);
  const result = await client.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, family_id, ip_address, user_agent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING id`,
    [userId, tokenHash, expiresAt, familyId || crypto.randomUUID(), ip || null, userAgent || null]
  );
  return result.rows[0].id;
}

// Constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authLimiter, validateRegister, auditLogMiddleware('user_registered', 'auth'), asyncHandler(async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { email, password, firstName, lastName, role = 'user' } = req.body;

    // Check if email already exists
    const existingUsers = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUsers.rows.length > 0) {
      await client.query('ROLLBACK');
      throw ApiError.conflict('Email already registered');
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      await client.query('ROLLBACK');
      throw ApiError.badRequest('Password does not meet security requirements', passwordValidation.errors);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Only allow 'user' role for self-registration
    const userRole = role === 'admin' || role === 'manager' ? 'user' : role;

    // Insert new user
    const result = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [email, hashedPassword, firstName, lastName, userRole]
    );

    const userId = result.rows[0].id;

    // Log registration in audit log
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, created_at)
       VALUES ($1, 'user_registered', 'user', $2, $3, $4, CURRENT_TIMESTAMP)`,
      [userId, userId, req.ip, req.get('user-agent')]
    );

    await client.query('COMMIT');

    // Fetch the tenant_id assigned by the DEFAULT on the users table
    const newUser = await client.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    const tenantId = newUser.rows[0].tenant_id;

    // Generate tokens
    const user = {
      id: userId,
      email,
      role: userRole,
      tenantId,
    };

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token with session metadata (outside tx — user row already committed)
    await storeRefreshToken(db, {
      userId,
      token: refreshToken,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          role: userRole,
          tenantId,
        },
        accessToken,
        refreshToken
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT tokens
 * @access  Public
 */
router.post('/login', authLimiter, validateLogin, auditLogMiddleware('login', 'auth'), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Fetch user from database
  const users = await db.query(
    `SELECT id, email, password_hash, first_name, last_name, role, is_active,
            failed_login_attempts, locked_until, tenant_id
     FROM users WHERE email = $1`,
    [email]
  );

  if (users.rows.length === 0) {
    // Don't reveal that email doesn't exist
    throw ApiError.unauthorized('Invalid email or password');
  }

  const user = users.rows[0];

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const lockTimeRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);

    throw new ApiError('ACCOUNT_LOCKED', `Account is locked due to too many failed login attempts. Please try again in ${lockTimeRemaining} minutes.`, { statusCode: 423 });
  }

  // Check if account is active
  if (!user.is_active) {
    throw ApiError.forbidden('Account is inactive. Please contact administrator.');
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    // Increment failed login attempts
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    const isLocked = failedAttempts >= MAX_FAILED_ATTEMPTS;
    const lockUntil = isLocked ? new Date(Date.now() + LOCK_TIME) : null;

    await db.query(
      `UPDATE users
       SET failed_login_attempts = $1,
           locked_until = $2
       WHERE id = $3`,
      [failedAttempts, lockUntil, user.id]
    );

    // Log failed attempt
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, details, created_at)
       VALUES ($1, 'login_failed', 'user', $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [user.id, user.id, req.ip, req.get('user-agent'), JSON.stringify({ failedAttempts, isLocked })]
    );

    if (isLocked) {
      throw new ApiError('ACCOUNT_LOCKED', 'Account has been locked due to too many failed login attempts. Please try again after 15 minutes.', { statusCode: 423 });
    }

    throw ApiError.unauthorized('Invalid email or password');
  }

  // Successful login - reset failed attempts
  await db.query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [user.id]
  );

  // Generate tokens
  const tokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Store refresh token with session metadata
  await storeRefreshToken(db, {
    userId: user.id,
    token: refreshToken,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log successful login
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, created_at)
     VALUES ($1, 'login_success', 'user', $2, $3, $4, CURRENT_TIMESTAMP)`,
    [user.id, user.id, req.ip, req.get('user-agent')]
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        tenantId: user.tenant_id,
      },
      accessToken,
      refreshToken
    }
  });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token (with rotation)
 * @access  Public
 *
 * Security model — Refresh-Token Rotation with Reuse Detection:
 *   1. Each refresh token can only be used ONCE.
 *   2. On use the old token is revoked and a new refresh + access pair is issued.
 *   3. If a revoked token is presented again, the ENTIRE token family is revoked
 *      (all devices for that lineage) because it indicates the token was stolen.
 */
router.post('/refresh', validateRefreshToken, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  // Verify JWT signature / expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw ApiError.unauthorized(error.message || 'Invalid refresh token');
  }

  // Look up the token by hash (regardless of revoked status — we need to detect reuse)
  const tokenHash = hashToken(refreshToken);
  const tokens = await db.query(
    `SELECT rt.*, u.email, u.role, u.is_active, u.tenant_id
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token = $1`,
    [tokenHash]
  );

  if (tokens.rows.length === 0) {
    throw ApiError.unauthorized('Refresh token does not exist');
  }

  const tokenData = tokens.rows[0];

  // ── Reuse detection ─────────────────────────────────────────────────
  // If the token was already revoked, someone is replaying a stolen token.
  // Revoke the ENTIRE family to protect the user.
  if (tokenData.revoked) {
    await db.query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE family_id = $1 AND revoked = false`,
      [tokenData.family_id]
    );

    console.warn(
      `[Auth] Refresh-token reuse detected for user ${tokenData.user_id}, ` +
      `family ${tokenData.family_id}. All tokens in family revoked.`
    );

    throw ApiError.unauthorized('Refresh token reuse detected. All sessions in this family have been revoked. Please log in again.');
  }

  // Check expiry
  if (new Date(tokenData.expires_at) < new Date()) {
    throw ApiError.unauthorized('Refresh token has expired');
  }

  // Check user account status
  if (!tokenData.is_active) {
    throw ApiError.forbidden('User account is inactive');
  }

  // ── Rotate: revoke old, issue new ───────────────────────────────────
  const user = {
    id: tokenData.user_id,
    email: tokenData.email,
    role: tokenData.role,
    tenantId: tokenData.tenant_id,
  };

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Store the new refresh token in the same family
  const newTokenId = await storeRefreshToken(db, {
    userId: tokenData.user_id,
    token: newRefreshToken,
    familyId: tokenData.family_id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Revoke the old token and link to its replacement
  await db.query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = CURRENT_TIMESTAMP,
         last_used_at = CURRENT_TIMESTAMP, replaced_by_id = $1
     WHERE id = $2`,
    [newTokenId, tokenData.id]
  );

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and revoke refresh token
 * @access  Private
 */
router.post('/logout', authenticate, auditLogMiddleware('logout', 'auth'), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    // Revoke the specific refresh token (look up by hash)
    const tokenHash = hashToken(refreshToken);
    await db.query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE token = $1 AND user_id = $2`,
      [tokenHash, req.user.id]
    );
  } else {
    // Revoke all refresh tokens for the user
    await db.query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked = false`,
      [req.user.id]
    );
  }

  // Log logout
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, created_at)
     VALUES ($1, 'logout', 'user', $2, $3, $4, CURRENT_TIMESTAMP)`,
    [req.user.id, req.user.id, req.ip, req.get('user-agent')]
  );

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { resolvePermissions } = require('../utils/permissions');

  // Fetch full user details from database
  const users = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at, u.last_login,
            u.pos_role_id, u.tenant_id, pr.name as pos_role_name, pr.display_name as pos_role_display, pr.permissions as pos_permissions
     FROM users u
     LEFT JOIN pos_roles pr ON u.pos_role_id = pr.id
     WHERE u.id = $1`,
    [req.user.id]
  );

  if (users.rows.length === 0) {
    throw ApiError.notFound('User');
  }

  const user = users.rows[0];
  const userObj = {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
    lastLogin: user.last_login,
    posRoleId: user.pos_role_id,
    posRoleName: user.pos_role_name,
    posRoleDisplay: user.pos_role_display,
    posPermissions: Array.isArray(user.pos_permissions) ? user.pos_permissions : null,
    tenantId: user.tenant_id,
  };

  res.json({
    success: true,
    data: {
      user: userObj,
      permissions: resolvePermissions(userObj),
    }
  });
}));

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password', authenticate, validateChangePassword, auditLogMiddleware('password_changed', 'auth'), asyncHandler(async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { currentPassword, newPassword } = req.body;

    // Fetch current user with password
    const users = await client.query(
      'SELECT id, email, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (users.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('User');
    }

    const user = users.rows[0];

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      await client.query('ROLLBACK');

      // Log failed password change attempt
      await db.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, details, created_at)
         VALUES ($1, 'password_change_failed', 'user', $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [req.user.id, req.user.id, req.ip, req.get('user-agent'), JSON.stringify({ reason: 'invalid_current_password' })]
      );

      throw ApiError.unauthorized('Current password is incorrect');
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      await client.query('ROLLBACK');
      throw ApiError.badRequest('New password does not meet security requirements', passwordValidation.errors);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    // Revoke all refresh tokens to force re-login on all devices
    await client.query(
      `UPDATE refresh_tokens
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked = false`,
      [req.user.id]
    );

    // Log successful password change
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, created_at)
       VALUES ($1, 'password_changed', 'user', $2, $3, $4, CURRENT_TIMESTAMP)`,
      [req.user.id, req.user.id, req.ip, req.get('user-agent')]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again with your new password.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * @route   GET /api/auth/sessions
 * @desc    Get all active sessions (refresh tokens) for current user
 * @access  Private
 */
router.get('/sessions', authenticate, asyncHandler(async (req, res) => {
  const sessions = await db.query(
    `SELECT id, created_at, expires_at, last_used_at, ip_address, user_agent
     FROM refresh_tokens
     WHERE user_id = $1 AND revoked = false AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.json({
    success: true,
    data: {
      sessions: sessions.rows.map(session => ({
        id: session.id,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
        lastUsedAt: session.last_used_at,
        ipAddress: session.ip_address,
        userAgent: session.user_agent
      }))
    }
  });
}));

/**
 * @route   DELETE /api/auth/sessions/:id
 * @desc    Revoke a specific session (refresh token)
 * @access  Private
 */
router.delete('/sessions/:id', authenticate, asyncHandler(async (req, res) => {
  const sessionId = req.params.id;

  // Revoke the session, but only if it belongs to the current user
  const result = await db.query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [sessionId, req.user.id]
  );

  if (result.rowCount === 0) {
    throw ApiError.notFound('Session');
  }

  res.json({
    success: true,
    message: 'Session revoked successfully'
  });
}));

module.exports = router;
