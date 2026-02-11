/**
 * API Keys Management Routes
 * Handles CRUD operations for API keys
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Generate a secure API key and secret
 */
function generateApiKey() {
  const apiKey = 'qapp_' + crypto.randomBytes(24).toString('hex'); // e.g., qapp_abc123...
  const apiSecret = crypto.randomBytes(32).toString('hex');
  return { apiKey, apiSecret };
}

/**
 * Hash API secret for storage
 */
function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * GET /api/api-keys
 * List all API keys (without secrets)
 * @access Private (admin only)
 */
router.get('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      id, key_name, api_key, permissions,
      is_active, last_used_at, expires_at, created_at
    FROM api_keys
    ORDER BY created_at DESC
  `);

  res.json({
    success: true,
    apiKeys: result.rows
  });
}));

/**
 * POST /api/api-keys
 * Create a new API key
 * @access Private (admin only)
 */
router.post('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const {
    key_name,
    permissions = { read: true, write: false, delete: false },
    expires_at
  } = req.body;

  if (!key_name || !key_name.trim()) {
    throw ApiError.badRequest('Key name is required');
  }

  // Generate API key
  const { apiKey } = generateApiKey();

  const result = await pool.query(`
    INSERT INTO api_keys (
      key_name, api_key, user_id, permissions, expires_at
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id, key_name, api_key, permissions,
              is_active, expires_at, created_at
  `, [
    key_name.trim(),
    apiKey,
    req.user?.id || null,
    JSON.stringify(permissions),
    expires_at || null
  ]);

  res.status(201).json({
    success: true,
    apiKey: result.rows[0],
    message: 'API key created successfully.'
  });
}));

/**
 * PUT /api/api-keys/:id
 * Update an API key
 * @access Private (admin only)
 */
router.put('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const apiKeyId = parseInt(id, 10);
  if (isNaN(apiKeyId) || apiKeyId <= 0) {
    throw ApiError.badRequest('Invalid API key ID');
  }
  const {
    key_name,
    permissions,
    is_active,
    expires_at
  } = req.body;

  const result = await pool.query(`
    UPDATE api_keys
    SET
      key_name = COALESCE($1, key_name),
      permissions = COALESCE($2, permissions),
      is_active = COALESCE($3, is_active),
      expires_at = COALESCE($4, expires_at)
    WHERE id = $5
    RETURNING id, key_name, api_key, permissions,
              is_active, expires_at, created_at
  `, [
    key_name,
    permissions ? JSON.stringify(permissions) : null,
    is_active,
    expires_at,
    apiKeyId
  ]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('API key');
  }

  res.json({
    success: true,
    apiKey: result.rows[0],
    message: 'API key updated successfully'
  });
}));

/**
 * DELETE /api/api-keys/:id
 * Delete an API key
 * @access Private (admin only)
 */
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const apiKeyId = parseInt(id, 10);
  if (isNaN(apiKeyId) || apiKeyId <= 0) {
    throw ApiError.badRequest('Invalid API key ID');
  }

  const result = await pool.query(
    'DELETE FROM api_keys WHERE id = $1 RETURNING *',
    [apiKeyId]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('API key');
  }

  res.json({
    success: true,
    message: 'API key deleted successfully'
  });
}));

/**
 * POST /api/api-keys/:id/regenerate
 * Regenerate the secret for an existing API key
 * @access Private (admin only)
 */
router.post('/:id/regenerate', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const apiKeyId = parseInt(id, 10);
  if (isNaN(apiKeyId) || apiKeyId <= 0) {
    throw ApiError.badRequest('Invalid API key ID');
  }

  // Generate new API key value
  const { apiKey: newApiKey } = generateApiKey();

  const result = await pool.query(`
    UPDATE api_keys
    SET api_key = $1
    WHERE id = $2
    RETURNING id, key_name, api_key
  `, [newApiKey, apiKeyId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('API key');
  }

  res.json({
    success: true,
    apiKey: result.rows[0],
    message: 'API key regenerated successfully.'
  });
}));

module.exports = { router, hashSecret };
