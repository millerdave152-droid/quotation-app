/**
 * JWT Utility Functions
 * Handles JWT token generation and verification for authentication
 * @module utils/jwt
 */

const jwt = require('jsonwebtoken');

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Generate Access Token
 * Creates a short-lived JWT access token for API authentication
 * @param {Object} user - User object containing id, email, and role
 * @returns {string} JWT access token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generateAccessToken = (user) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'quotation-app',
      audience: 'quotation-app-client'
    });

    return token;
  } catch (error) {
    console.error('Error generating access token:', error.message);
    throw new Error('Failed to generate access token');
  }
};

/**
 * Generate Refresh Token
 * Creates a long-lived JWT refresh token for obtaining new access tokens
 * @param {Object} user - User object containing id and email
 * @returns {string} JWT refresh token
 * @throws {Error} If JWT_REFRESH_SECRET is not configured
 */
const generateRefreshToken = (user) => {
  try {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured in environment variables');
    }

    const payload = {
      userId: user.id,
      email: user.email,
      type: 'refresh'
    };

    const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'quotation-app',
      audience: 'quotation-app-client'
    });

    return token;
  } catch (error) {
    console.error('Error generating refresh token:', error.message);
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Verify Access Token
 * Validates and decodes a JWT access token
 * @param {string} token - JWT access token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid, expired, or malformed
 */
const verifyAccessToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'quotation-app',
      audience: 'quotation-app-client'
    });

    // Verify token type
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Access token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid access token');
    } else if (error instanceof jwt.NotBeforeError) {
      throw new Error('Access token not yet valid');
    } else {
      console.error('Error verifying access token:', error.message);
      throw error;
    }
  }
};

/**
 * Verify Refresh Token
 * Validates and decodes a JWT refresh token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid, expired, or malformed
 */
const verifyRefreshToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured in environment variables');
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: 'quotation-app',
      audience: 'quotation-app-client'
    });

    // Verify token type
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    } else if (error instanceof jwt.NotBeforeError) {
      throw new Error('Refresh token not yet valid');
    } else {
      console.error('Error verifying refresh token:', error.message);
      throw error;
    }
  }
};

/**
 * Decode Token Without Verification
 * Used for debugging or extracting token info without validation
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    console.error('Error decoding token:', error.message);
    return null;
  }
};

/**
 * Get Token Expiration Time
 * Extract expiration timestamp from token
 * @param {string} token - JWT token
 * @returns {number|null} Unix timestamp of expiration or null
 */
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.exp || null;
  } catch (error) {
    console.error('Error getting token expiration:', error.message);
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenExpiration,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
