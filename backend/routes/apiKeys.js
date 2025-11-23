/**
 * API Keys Management Routes
 * Handles CRUD operations for API keys
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');

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
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, key_name, api_key, created_by, permissions,
        is_active, last_used_at, expires_at, created_at,
        rate_limit_per_hour, allowed_ips, notes
      FROM api_keys
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      apiKeys: result.rows
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API keys'
    });
  }
});

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post('/', async (req, res) => {
  try {
    const {
      key_name,
      permissions = { read: true, write: false, delete: false },
      expires_at,
      rate_limit_per_hour = 1000,
      allowed_ips,
      notes,
      created_by
    } = req.body;

    if (!key_name || !key_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Key name is required'
      });
    }

    // Generate API key and secret
    const { apiKey, apiSecret } = generateApiKey();
    const hashedSecret = hashSecret(apiSecret);

    const result = await pool.query(`
      INSERT INTO api_keys (
        key_name, api_key, api_secret, created_by, permissions,
        expires_at, rate_limit_per_hour, allowed_ips, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, key_name, api_key, created_by, permissions,
                is_active, expires_at, created_at, rate_limit_per_hour,
                allowed_ips, notes
    `, [
      key_name.trim(),
      apiKey,
      hashedSecret,
      created_by || 'system',
      JSON.stringify(permissions),
      expires_at || null,
      rate_limit_per_hour,
      allowed_ips || null,
      notes || null
    ]);

    console.log('✅ API key created:', apiKey);

    // Return the secret ONLY on creation (it won't be shown again)
    res.status(201).json({
      success: true,
      apiKey: result.rows[0],
      apiSecret: apiSecret, // ⚠️ IMPORTANT: Save this secret, it won't be shown again!
      message: 'API key created successfully. Save the secret now - it will not be shown again!'
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key'
    });
  }
});

/**
 * PUT /api/api-keys/:id
 * Update an API key
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      key_name,
      permissions,
      is_active,
      expires_at,
      rate_limit_per_hour,
      allowed_ips,
      notes
    } = req.body;

    const result = await pool.query(`
      UPDATE api_keys
      SET
        key_name = COALESCE($1, key_name),
        permissions = COALESCE($2, permissions),
        is_active = COALESCE($3, is_active),
        expires_at = COALESCE($4, expires_at),
        rate_limit_per_hour = COALESCE($5, rate_limit_per_hour),
        allowed_ips = COALESCE($6, allowed_ips),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, key_name, api_key, created_by, permissions,
                is_active, expires_at, created_at, updated_at,
                rate_limit_per_hour, allowed_ips, notes
    `, [
      key_name,
      permissions ? JSON.stringify(permissions) : null,
      is_active,
      expires_at,
      rate_limit_per_hour,
      allowed_ips,
      notes,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      apiKey: result.rows[0],
      message: 'API key updated successfully'
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update API key'
    });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Delete an API key
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM api_keys WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    console.log('✅ API key deleted:', result.rows[0].api_key);

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

/**
 * POST /api/api-keys/:id/regenerate
 * Regenerate the secret for an existing API key
 */
router.post('/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;

    // Generate new secret
    const { apiSecret } = generateApiKey();
    const hashedSecret = hashSecret(apiSecret);

    const result = await pool.query(`
      UPDATE api_keys
      SET api_secret = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, key_name, api_key
    `, [hashedSecret, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    console.log('✅ API secret regenerated for key:', result.rows[0].api_key);

    res.json({
      success: true,
      apiKey: result.rows[0],
      apiSecret: apiSecret, // ⚠️ Save this secret now!
      message: 'Secret regenerated successfully. Save it now - it will not be shown again!'
    });
  } catch (error) {
    console.error('Error regenerating API secret:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate API secret'
    });
  }
});

module.exports = { router, hashSecret };
