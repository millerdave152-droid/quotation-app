/**
 * AI Assistant Feature Flags & Kill Switch
 *
 * Controls AI functionality at runtime via:
 * - Environment variable: AI_ASSISTANT_ENABLED
 * - Database setting: ai_assistant_enabled
 * - Runtime memory toggle (admin API)
 *
 * Priority order (highest to lowest):
 * 1. Runtime override (in-memory, set via admin API)
 * 2. Database setting (persistent)
 * 3. Environment variable (deployment config)
 * 4. Default: enabled
 */

const db = require('../../config/database');

// ============================================================
// IN-MEMORY STATE
// ============================================================
let runtimeOverride = null; // null = no override, true/false = override value
let lastDbCheck = 0;
let cachedDbSetting = null;
const DB_CACHE_TTL_MS = 30000; // Cache DB setting for 30 seconds

// ============================================================
// FALLBACK RESPONSE
// ============================================================
const FALLBACK_RESPONSE = {
  message: `I'm currently unavailable for assistance. In the meantime, you can:

• **Check our FAQ**: Common questions about orders, returns, and products
• **Contact Support**: Call 1-800-555-0123 or email support@teletime.ca
• **View Help Center**: Visit our online help center for guides and tutorials

I'll be back online soon. Thank you for your patience!`,

  isDisabled: true,
  model: 'none',
  queryType: 'fallback',
  responseTimeMs: 0,
  tokenUsage: { input_tokens: 0, output_tokens: 0 }
};

// ============================================================
// FEATURE FLAG FUNCTIONS
// ============================================================

/**
 * Check if AI Assistant is enabled
 * @returns {Promise<boolean>}
 */
async function isEnabled() {
  // 1. Check runtime override first (highest priority)
  if (runtimeOverride !== null) {
    return runtimeOverride;
  }

  // 2. Check database setting (with caching)
  const now = Date.now();
  if (cachedDbSetting === null || (now - lastDbCheck) > DB_CACHE_TTL_MS) {
    try {
      const result = await db.query(
        `SELECT setting_value FROM system_settings
         WHERE setting_key = 'ai_assistant_enabled' LIMIT 1`
      );
      if (result.rows.length > 0) {
        cachedDbSetting = result.rows[0].setting_value === 'true';
        lastDbCheck = now;
        return cachedDbSetting;
      }
    } catch (error) {
      // Table might not exist or query failed - fall through to env var
      console.warn('[FeatureFlags] DB check failed:', error.message);
    }
  } else if (cachedDbSetting !== null) {
    return cachedDbSetting;
  }

  // 3. Check environment variable
  const envValue = process.env.AI_ASSISTANT_ENABLED;
  if (envValue !== undefined) {
    return envValue.toLowerCase() === 'true' || envValue === '1';
  }

  // 4. Default: enabled
  return true;
}

/**
 * Get the current status including all flag sources
 * @returns {Promise<object>}
 */
async function getStatus() {
  let dbSetting = null;
  try {
    const result = await db.query(
      `SELECT setting_value, updated_at FROM system_settings
       WHERE setting_key = 'ai_assistant_enabled' LIMIT 1`
    );
    if (result.rows.length > 0) {
      dbSetting = {
        value: result.rows[0].setting_value === 'true',
        updatedAt: result.rows[0].updated_at
      };
    }
  } catch (error) {
    // Ignore - table might not exist
  }

  const envValue = process.env.AI_ASSISTANT_ENABLED;

  return {
    enabled: await isEnabled(),
    sources: {
      runtimeOverride: runtimeOverride,
      database: dbSetting,
      environment: envValue !== undefined ? (envValue.toLowerCase() === 'true' || envValue === '1') : null,
      default: true
    },
    effectiveSource: runtimeOverride !== null ? 'runtime' :
                     dbSetting !== null ? 'database' :
                     envValue !== undefined ? 'environment' : 'default'
  };
}

/**
 * Set runtime override (in-memory, lost on restart)
 * @param {boolean|null} value - true/false to override, null to clear
 */
function setRuntimeOverride(value) {
  runtimeOverride = value;
  console.log(`[FeatureFlags] Runtime override set to: ${value}`);
}

/**
 * Set database setting (persistent)
 * @param {boolean} value
 * @param {string} changedBy - Who made the change
 */
async function setDatabaseSetting(value, changedBy = 'system') {
  try {
    // Ensure system_settings table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100)
      )
    `);

    await db.query(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_at, updated_by)
       VALUES ('ai_assistant_enabled', $1, 'AI Assistant kill switch', CURRENT_TIMESTAMP, $2)
       ON CONFLICT (setting_key) DO UPDATE SET
         setting_value = $1,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = $2`,
      [value.toString(), changedBy]
    );

    // Clear cache to pick up new value
    cachedDbSetting = null;
    lastDbCheck = 0;

    console.log(`[FeatureFlags] Database setting updated to: ${value} by ${changedBy}`);
    return true;
  } catch (error) {
    console.error('[FeatureFlags] Failed to update database setting:', error.message);
    throw error;
  }
}

/**
 * Get the fallback response when AI is disabled
 * @returns {object}
 */
function getFallbackResponse() {
  return { ...FALLBACK_RESPONSE };
}

/**
 * Clear all caches (useful for testing)
 */
function clearCache() {
  runtimeOverride = null;
  cachedDbSetting = null;
  lastDbCheck = 0;
}

// ============================================================
// MIDDLEWARE
// ============================================================

/**
 * Express middleware to check if AI is enabled
 * Returns fallback response if disabled
 */
function checkEnabled() {
  return async (req, res, next) => {
    const enabled = await isEnabled();

    if (!enabled) {
      // Log the blocked request
      console.log(`[FeatureFlags] AI request blocked (disabled): ${req.method} ${req.path}`);

      return res.status(503).json({
        success: false,
        message: 'AI Assistant is temporarily unavailable',
        data: {
          fallback: getFallbackResponse().message,
          isDisabled: true
        }
      });
    }

    next();
  };
}

module.exports = {
  isEnabled,
  getStatus,
  setRuntimeOverride,
  setDatabaseSetting,
  getFallbackResponse,
  clearCache,
  checkEnabled,
  FALLBACK_RESPONSE
};
