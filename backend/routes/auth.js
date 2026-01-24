/**
 * Authentication Routes
 * Handles user authentication, registration, and session management
 * @module routes/auth
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateRefreshToken,
} = require('../middleware/validation');
const { authLimiter } = require('../middleware/security');
const crypto = require('crypto');

// Constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authLimiter, validateRegister, async (req, res) => {
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
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        errors: passwordValidation.errors
      });
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

    // Generate tokens
    const user = {
      id: userId,
      email,
      role: userRole
    };

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in database
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [userId, refreshToken, tokenExpiry]
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          role: userRole
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  } finally {
    client.release();
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT tokens
 * @access  Public
 */
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fetch user from database
    const users = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active,
              failed_login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email]
    );

    if (users.rows.length === 0) {
      // Don't reveal that email doesn't exist
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockTimeRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);

      return res.status(423).json({
        success: false,
        message: `Account is locked due to too many failed login attempts. Please try again in ${lockTimeRemaining} minutes.`,
        lockedUntil: user.locked_until
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
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
        return res.status(423).json({
          success: false,
          message: 'Account has been locked due to too many failed login attempts. Please try again after 15 minutes.'
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        attemptsRemaining: MAX_FAILED_ATTEMPTS - failedAttempts
      });
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
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token in database
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [user.id, refreshToken, tokenExpiry]
    );

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
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', validateRefreshToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Invalid refresh token'
      });
    }

    // Check if refresh token exists in database and is not revoked
    const tokens = await db.query(
      `SELECT rt.*, u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token = $1 AND rt.is_revoked = false`,
      [refreshToken]
    );

    if (tokens.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked or does not exist'
      });
    }

    const tokenData = tokens.rows[0];

    // Check if token has expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired'
      });
    }

    // Check if user is still active
    if (!tokenData.is_active) {
      return res.status(403).json({
        success: false,
        message: 'User account is inactive'
      });
    }

    // Generate new access token
    const user = {
      id: tokenData.user_id,
      email: tokenData.email,
      role: tokenData.role
    };

    const newAccessToken = generateAccessToken(user);

    // Update token's last used timestamp
    await db.query(
      'UPDATE refresh_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tokenData.id]
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed. Please try again.'
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and revoke refresh token
 * @access  Private
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Revoke the specific refresh token
      await db.query(
        `UPDATE refresh_tokens
         SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
         WHERE token = $1 AND user_id = $2`,
        [refreshToken, req.user.id]
      );
    } else {
      // Revoke all refresh tokens for the user
      await db.query(
        `UPDATE refresh_tokens
         SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND is_revoked = false`,
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
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed. Please try again.'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Fetch full user details from database
    const users = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, last_login
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (users.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users.rows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at,
          lastLogin: user.last_login
        }
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user information'
    });
  }
});

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password', authenticate, validateChangePassword, async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
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

      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'New password does not meet security requirements',
        errors: passwordValidation.errors
      });
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
       SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_revoked = false`,
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
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed. Please try again.'
    });
  } finally {
    client.release();
  }
});

/**
 * @route   GET /api/auth/sessions
 * @desc    Get all active sessions (refresh tokens) for current user
 * @access  Private
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await db.query(
      `SELECT id, created_at, last_used_at, expires_at, ip_address, user_agent
       FROM refresh_tokens
       WHERE user_id = $1 AND is_revoked = false AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_used_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        sessions: sessions.rows.map(session => ({
          id: session.id,
          createdAt: session.created_at,
          lastUsedAt: session.last_used_at,
          expiresAt: session.expires_at,
          ipAddress: session.ip_address,
          userAgent: session.user_agent
        }))
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions'
    });
  }
});

/**
 * @route   DELETE /api/auth/sessions/:id
 * @desc    Revoke a specific session (refresh token)
 * @access  Private
 */
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Revoke the session, but only if it belongs to the current user
    const result = await db.query(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [sessionId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke session'
    });
  }
});

module.exports = router;
