/**
 * TeleTime POS - Manager Override Service
 *
 * Handles manager approval workflows for:
 * - Discount approvals (percentage and amount thresholds)
 * - Margin protection (minimum margin enforcement)
 * - Below-cost sale approvals
 * - Void/refund approvals
 * - PIN verification with lockout protection
 * - Complete audit logging
 */

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
const DEFAULT_LOCKOUT_MINUTES = 15;
const DEFAULT_MAX_ATTEMPTS = 3;

class ManagerOverrideService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_KEY_THRESHOLDS = 'override_thresholds';
    this.CACHE_TTL = 300; // 5 minutes
  }

  // ============================================================================
  // THRESHOLD CHECKING
  // ============================================================================

  /**
   * Check if an action requires manager approval
   * @param {string} overrideType - Type of override (discount_percent, discount_amount, margin_below, price_below_cost)
   * @param {number} value - The value to check against threshold
   * @param {object} context - Additional context (lineItem, subtotal, categoryId, etc.)
   * @returns {object} { requiresApproval, threshold, requiredApprovalLevel, message }
   */
  async checkRequiresApproval(overrideType, value, context = {}) {
    try {
      const { lineItem, subtotal, channel = 'pos', categoryId = null } = context;

      // Get applicable thresholds
      const thresholds = await this.getActiveThresholds(channel, categoryId);

      // Find matching threshold
      const matchingThreshold = thresholds.find((t) => {
        if (t.threshold_type !== overrideType) return false;
        if (!t.is_active || !t.requires_approval) return false;

        // Check channel applicability
        if (channel === 'pos' && !t.applies_to_pos) return false;
        if (channel === 'quote' && !t.applies_to_quotes) return false;

        // Check category-specific thresholds (null matches all categories)
        if (t.category_id !== null && categoryId !== null && t.category_id !== categoryId) {
          return false;
        }

        // Check validity period (valid_from/valid_to for time-limited rules like sales events)
        const now = new Date();
        if (t.valid_from && new Date(t.valid_from) > now) {
          return false;
        }
        if (t.valid_to && new Date(t.valid_to) < now) {
          return false;
        }

        // Check time-of-day restrictions
        if (t.active_start_time && t.active_end_time) {
          const currentTime = now.toTimeString().slice(0, 8);
          if (currentTime < t.active_start_time || currentTime > t.active_end_time) {
            return false;
          }
        }

        // Check day restrictions
        if (t.active_days && t.active_days.length > 0) {
          const today = new Date().getDay();
          if (!t.active_days.includes(today)) {
            return false;
          }
        }

        return true;
      });

      if (!matchingThreshold) {
        return {
          requiresApproval: false,
          threshold: null,
          message: null,
        };
      }

      // Evaluate threshold based on type
      const thresholdValue = parseFloat(matchingThreshold.threshold_value) ||
        (matchingThreshold.threshold_value_cents / 100);
      let requiresApproval = false;
      let message = '';

      switch (overrideType) {
        case 'discount_percent':
          requiresApproval = value > thresholdValue;
          if (requiresApproval) {
            message = `Discount of ${value.toFixed(1)}% exceeds ${thresholdValue}% threshold. Manager approval required.`;
          }
          break;

        case 'discount_amount':
          requiresApproval = value > thresholdValue;
          if (requiresApproval) {
            message = `Discount of $${value.toFixed(2)} exceeds $${thresholdValue.toFixed(2)} threshold. Manager approval required.`;
          }
          break;

        case 'margin_below':
          requiresApproval = value < thresholdValue;
          if (requiresApproval) {
            message = `Margin of ${value.toFixed(1)}% is below ${thresholdValue}% minimum. Manager approval required.`;
          }
          break;

        case 'price_below_cost':
          requiresApproval = value < 0; // value is margin, negative means below cost
          if (requiresApproval) {
            message = 'Selling below cost requires manager approval.';
          }
          break;

        case 'void_transaction':
        case 'void_item':
        case 'refund_no_receipt':
        case 'drawer_adjustment':
          requiresApproval = true;
          message = `${this._formatOverrideType(overrideType)} requires manager approval.`;
          break;

        case 'refund_amount':
          requiresApproval = value > thresholdValue;
          if (requiresApproval) {
            message = `Refund of $${value.toFixed(2)} exceeds $${thresholdValue.toFixed(2)} threshold. Manager approval required.`;
          }
          break;

        default:
          requiresApproval = false;
      }

      // Check for exceptions
      if (requiresApproval && context.productId) {
        const hasException = await this._checkException(
          matchingThreshold.id,
          context
        );
        if (hasException) {
          return {
            requiresApproval: false,
            threshold: matchingThreshold,
            message: 'Exception applied - no approval required.',
            exceptionApplied: true,
          };
        }
      }

      // Get the required approval level based on value (tiered approvals)
      let requiredApprovalLevel = matchingThreshold.approval_level;
      let approvalLevels = null;

      if (requiresApproval) {
        const tieredLevel = await this.getRequiredApprovalLevel(matchingThreshold.id, value);
        if (tieredLevel) {
          requiredApprovalLevel = tieredLevel.level;
          approvalLevels = tieredLevel.allLevels;
        }
      }

      return {
        requiresApproval,
        threshold: requiresApproval ? {
          id: matchingThreshold.id,
          type: matchingThreshold.threshold_type,
          value: thresholdValue,
          name: matchingThreshold.name,
          requiredLevel: requiredApprovalLevel,
          defaultLevel: matchingThreshold.approval_level,
          requireReason: matchingThreshold.require_reason,
          categoryId: matchingThreshold.category_id,
          validFrom: matchingThreshold.valid_from,
          validTo: matchingThreshold.valid_to,
          approvalLevels,
        } : null,
        message: requiresApproval ? message : null,
      };
    } catch (error) {
      console.error('[ManagerOverride] checkRequiresApproval error:', error);
      throw error;
    }
  }

  /**
   * Comprehensive check for line item discount
   * Checks both percentage and amount thresholds
   */
  async checkDiscountApproval(originalPrice, discountedPrice, quantity = 1, cost = null, context = {}) {
    const discountAmount = (originalPrice - discountedPrice) * quantity;
    const discountPercent = originalPrice > 0
      ? ((originalPrice - discountedPrice) / originalPrice) * 100
      : 0;

    const results = {
      requiresApproval: false,
      checks: [],
      highestLevel: null,
      messages: [],
    };

    // Check discount percentage
    const percentCheck = await this.checkRequiresApproval('discount_percent', discountPercent, context);
    if (percentCheck.requiresApproval) {
      results.checks.push({ type: 'discount_percent', ...percentCheck });
      results.messages.push(percentCheck.message);
    }

    // Check discount amount
    const amountCheck = await this.checkRequiresApproval('discount_amount', discountAmount, context);
    if (amountCheck.requiresApproval) {
      results.checks.push({ type: 'discount_amount', ...amountCheck });
      results.messages.push(amountCheck.message);
    }

    // Check margin if cost is provided
    if (cost !== null && cost > 0) {
      const margin = ((discountedPrice - cost) / discountedPrice) * 100;
      const marginCheck = await this.checkRequiresApproval('margin_below', margin, context);
      if (marginCheck.requiresApproval) {
        results.checks.push({ type: 'margin_below', ...marginCheck });
        results.messages.push(marginCheck.message);
      }

      // Check if selling below cost
      if (discountedPrice < cost) {
        const belowCostCheck = await this.checkRequiresApproval('price_below_cost', margin, context);
        if (belowCostCheck.requiresApproval) {
          results.checks.push({ type: 'price_below_cost', ...belowCostCheck });
          results.messages.push(belowCostCheck.message);
        }
      }
    }

    // Determine if approval is required and what level
    results.requiresApproval = results.checks.length > 0;

    if (results.requiresApproval) {
      // Get the highest required approval level
      const levels = ['shift_lead', 'manager', 'area_manager', 'admin'];
      let highestIndex = -1;

      for (const check of results.checks) {
        if (check.threshold?.requiredLevel) {
          const idx = levels.indexOf(check.threshold.requiredLevel);
          if (idx > highestIndex) {
            highestIndex = idx;
            results.highestLevel = check.threshold.requiredLevel;
            results.highestThreshold = check.threshold;
          }
        }
      }

      // Check if reason is required
      results.requireReason = results.checks.some((c) => c.threshold?.requireReason);
    }

    return results;
  }

  // ============================================================================
  // PIN MANAGEMENT
  // ============================================================================

  /**
   * Create or update a manager PIN
   * @param {number} userId - User ID
   * @param {string} pin - Plain text PIN (will be hashed)
   * @param {string} approvalLevel - Authorization level
   * @param {object} options - Additional options
   */
  async setManagerPin(userId, pin, approvalLevel = 'manager', options = {}) {
    try {
      const {
        maxDailyOverrides = null,
        validUntil = null,
        createdBy = null,
      } = options;

      // Validate PIN format (4-6 digits)
      if (!/^\d{4,6}$/.test(pin)) {
        return {
          success: false,
          error: 'PIN must be 4-6 digits',
        };
      }

      // Hash the PIN
      const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

      // Deactivate existing PIN for this user
      await this.pool.query(
        `UPDATE manager_pins SET is_active = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );

      // Insert new PIN
      const result = await this.pool.query(
        `INSERT INTO manager_pins (
          user_id, pin_hash, approval_level, max_daily_overrides,
          valid_until, created_by, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING id`,
        [userId, pinHash, approvalLevel, maxDailyOverrides, validUntil, createdBy]
      );

      return {
        success: true,
        pinId: result.rows[0].id,
      };
    } catch (error) {
      console.error('[ManagerOverride] setManagerPin error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate a manager's PIN
   * @param {string} pin - Plain text PIN to verify
   * @param {string} requiredLevel - Minimum required approval level
   * @param {number} userId - Optional specific user ID to validate
   * @returns {object} { valid, managerId, managerName, approvalLevel, error }
   */
  async validateManagerPin(pin, requiredLevel = 'manager', userId = null) {
    try {
      // Get level hierarchy
      const levels = ['shift_lead', 'manager', 'area_manager', 'admin'];
      const requiredIndex = levels.indexOf(requiredLevel);

      if (requiredIndex === -1) {
        return {
          valid: false,
          error: 'Invalid approval level specified',
        };
      }

      // Build query
      let query = `
        SELECT mp.*, CONCAT(u.first_name, ' ', u.last_name) as manager_name, u.email as manager_email
        FROM manager_pins mp
        JOIN users u ON mp.user_id = u.id
        WHERE mp.is_active = TRUE
          AND (mp.valid_until IS NULL OR mp.valid_until > NOW())
      `;
      const params = [];

      if (userId) {
        query += ' AND mp.user_id = $1';
        params.push(userId);
      }

      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        return {
          valid: false,
          error: 'No active manager PINs found',
        };
      }

      // Try to match PIN against all eligible managers
      for (const pinRecord of result.rows) {
        // Check if locked out
        if (pinRecord.locked_until && new Date(pinRecord.locked_until) > new Date()) {
          continue; // Skip locked accounts
        }

        // Verify PIN
        const pinValid = await bcrypt.compare(pin, pinRecord.pin_hash);

        if (pinValid) {
          // Check approval level
          const managerLevel = levels.indexOf(pinRecord.approval_level);
          if (managerLevel < requiredIndex) {
            // Reset failed attempts since PIN was correct
            await this._resetFailedAttempts(pinRecord.id);

            return {
              valid: false,
              managerId: pinRecord.user_id,
              managerName: pinRecord.manager_name,
              approvalLevel: pinRecord.approval_level,
              error: `Requires ${requiredLevel} level or higher. Your level: ${pinRecord.approval_level}`,
            };
          }

          // Check daily limit
          if (pinRecord.max_daily_overrides !== null) {
            const today = new Date().toISOString().split('T')[0];
            const lastDate = pinRecord.last_override_date?.toISOString().split('T')[0];

            if (lastDate === today && pinRecord.override_count_today >= pinRecord.max_daily_overrides) {
              return {
                valid: false,
                managerId: pinRecord.user_id,
                managerName: pinRecord.manager_name,
                approvalLevel: pinRecord.approval_level,
                error: 'Daily override limit reached',
                remainingOverrides: 0,
              };
            }
          }

          // Success! Update usage tracking
          await this._recordPinUsage(pinRecord.id);

          return {
            valid: true,
            managerId: pinRecord.user_id,
            managerName: pinRecord.manager_name,
            managerEmail: pinRecord.manager_email,
            approvalLevel: pinRecord.approval_level,
            remainingOverrides: pinRecord.max_daily_overrides !== null
              ? pinRecord.max_daily_overrides - (pinRecord.override_count_today || 0) - 1
              : null,
          };
        }
      }

      // PIN didn't match any manager - record failed attempt
      // If userId was specified, record against that specific PIN
      if (userId) {
        const pinRecord = result.rows[0];
        await this._recordFailedAttempt(pinRecord.id, pinRecord.max_failed_attempts, pinRecord.lockout_duration_minutes);

        // Check if now locked
        const updatedRecord = await this.pool.query(
          'SELECT locked_until, failed_attempts FROM manager_pins WHERE id = $1',
          [pinRecord.id]
        );

        if (updatedRecord.rows[0]?.locked_until) {
          const lockUntil = new Date(updatedRecord.rows[0].locked_until);
          return {
            valid: false,
            error: `Account locked until ${lockUntil.toLocaleTimeString()}`,
            lockedUntil: lockUntil,
          };
        }

        return {
          valid: false,
          error: `Invalid PIN. ${(pinRecord.max_failed_attempts || DEFAULT_MAX_ATTEMPTS) - updatedRecord.rows[0].failed_attempts} attempts remaining.`,
          attemptsRemaining: (pinRecord.max_failed_attempts || DEFAULT_MAX_ATTEMPTS) - updatedRecord.rows[0].failed_attempts,
        };
      }

      return {
        valid: false,
        error: 'Invalid PIN',
      };
    } catch (error) {
      console.error('[ManagerOverride] validateManagerPin error:', error);
      return {
        valid: false,
        error: 'PIN verification failed',
      };
    }
  }

  /**
   * Check if a user has manager PIN access
   */
  async hasManagerAccess(userId) {
    try {
      const result = await this.pool.query(
        `SELECT approval_level FROM manager_pins
         WHERE user_id = $1 AND is_active = TRUE
         AND (valid_until IS NULL OR valid_until > NOW())
         AND (locked_until IS NULL OR locked_until < NOW())`,
        [userId]
      );

      return {
        hasAccess: result.rows.length > 0,
        approvalLevel: result.rows[0]?.approval_level || null,
      };
    } catch (error) {
      console.error('[ManagerOverride] hasManagerAccess error:', error);
      return { hasAccess: false, approvalLevel: null };
    }
  }

  // ============================================================================
  // OVERRIDE LOGGING
  // ============================================================================

  /**
   * Log an override (approved or denied)
   * @param {object} details - Override details
   * @returns {object} { success, logId }
   */
  async logOverride(details) {
    try {
      const {
        overrideType,
        thresholdId = null,
        transactionId = null,
        quotationId = null,
        shiftId = null,
        registerId = null,
        cashierId = null,
        approvedBy,
        originalValue,
        overrideValue,
        wasApproved,
        reason = null,
        denialReason = null,
        productId = null,
        productName = null,
        quantity = null,
        requestId = null,
        verificationMethod = 'pin',
        ipAddress = null,
        deviceId = null,
      } = details;

      // Get approval level for the approving manager
      let approvalLevel = 'manager';
      if (approvedBy) {
        const levelResult = await this.pool.query(
          `SELECT approval_level FROM manager_pins
           WHERE user_id = $1 AND is_active = TRUE`,
          [approvedBy]
        );
        if (levelResult.rows.length > 0) {
          approvalLevel = levelResult.rows[0].approval_level;
        }
      }

      // Get threshold snapshot
      let thresholdSnapshot = null;
      if (thresholdId) {
        const thresholdResult = await this.pool.query(
          'SELECT * FROM override_thresholds WHERE id = $1',
          [thresholdId]
        );
        if (thresholdResult.rows.length > 0) {
          thresholdSnapshot = thresholdResult.rows[0];
        }
      }

      // Calculate difference
      const differenceValue = overrideValue - originalValue;
      const differencePercent = originalValue !== 0
        ? (differenceValue / originalValue) * 100
        : null;

      // Insert log entry
      const result = await this.pool.query(
        `INSERT INTO override_log (
          request_id, override_type, threshold_id,
          transaction_id, quotation_id, shift_id, register_id,
          cashier_id, approved_by, approval_level,
          original_value, override_value, difference_value, difference_percent,
          product_id, product_name, quantity,
          reason, was_approved, denial_reason,
          verification_method, ip_address, device_id,
          threshold_snapshot, approved_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, NOW()
        ) RETURNING id`,
        [
          requestId, overrideType, thresholdId,
          transactionId, quotationId, shiftId, registerId,
          cashierId, approvedBy, approvalLevel,
          originalValue, overrideValue, differenceValue, differencePercent,
          productId, productName, quantity,
          reason, wasApproved, denialReason,
          verificationMethod, ipAddress, deviceId,
          thresholdSnapshot ? JSON.stringify(thresholdSnapshot) : null,
        ]
      );

      // Update request status if provided
      if (requestId) {
        await this.pool.query(
          `UPDATE override_requests
           SET status = $1, resolved_by = $2, resolved_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [wasApproved ? 'approved' : 'denied', approvedBy, requestId]
        );
      }

      return {
        success: true,
        logId: result.rows[0].id,
      };
    } catch (error) {
      console.error('[ManagerOverride] logOverride error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create an override request (for async approval flow)
   */
  async createOverrideRequest(details) {
    try {
      const {
        overrideType,
        thresholdId = null,
        transactionId = null,
        quotationId = null,
        shiftId = null,
        registerId = null,
        requestedBy,
        originalValue,
        requestedValue,
        reason = null,
        productId = null,
        productName = null,
        quantity = null,
        expiresInMinutes = 10,
      } = details;

      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      const result = await this.pool.query(
        `INSERT INTO override_requests (
          override_type, threshold_id,
          transaction_id, quotation_id, shift_id, register_id,
          requested_by, original_value, requested_value,
          difference_value, difference_percent,
          product_id, product_name, quantity,
          reason, expires_at, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending'
        ) RETURNING id, request_code`,
        [
          overrideType, thresholdId,
          transactionId, quotationId, shiftId, registerId,
          requestedBy, originalValue, requestedValue,
          requestedValue - originalValue,
          originalValue !== 0 ? ((requestedValue - originalValue) / originalValue) * 100 : null,
          productId, productName, quantity,
          reason, expiresAt,
        ]
      );

      return {
        success: true,
        requestId: result.rows[0].id,
        requestCode: result.rows[0].request_code,
        expiresAt,
      };
    } catch (error) {
      console.error('[ManagerOverride] createOverrideRequest error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get pending override requests
   */
  async getPendingRequests(options = {}) {
    try {
      const { shiftId, registerId, limit = 50 } = options;

      let query = `
        SELECT
          r.*,
          CONCAT(u.first_name, ' ', u.last_name) as requested_by_name,
          ot.name as threshold_name,
          ot.approval_level as required_level
        FROM override_requests r
        LEFT JOIN users u ON r.requested_by = u.id
        LEFT JOIN override_thresholds ot ON r.threshold_id = ot.id
        WHERE r.status = 'pending'
          AND (r.expires_at IS NULL OR r.expires_at > NOW())
      `;
      const params = [];
      let paramIndex = 1;

      if (shiftId) {
        query += ` AND r.shift_id = $${paramIndex++}`;
        params.push(shiftId);
      }

      if (registerId) {
        query += ` AND r.register_id = $${paramIndex++}`;
        params.push(registerId);
      }

      query += ` ORDER BY r.requested_at ASC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.pool.query(query, params);

      return {
        success: true,
        requests: result.rows,
      };
    } catch (error) {
      console.error('[ManagerOverride] getPendingRequests error:', error);
      return {
        success: false,
        error: error.message,
        requests: [],
      };
    }
  }

  /**
   * Approve or deny a pending request
   */
  async resolveRequest(requestId, pin, approved, reason = null) {
    try {
      // Get the request
      const requestResult = await this.pool.query(
        `SELECT r.*, ot.approval_level as required_level
         FROM override_requests r
         LEFT JOIN override_thresholds ot ON r.threshold_id = ot.id
         WHERE r.id = $1 AND r.status = 'pending'`,
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        return {
          success: false,
          error: 'Request not found or already resolved',
        };
      }

      const request = requestResult.rows[0];

      // Check if expired
      if (request.expires_at && new Date(request.expires_at) < new Date()) {
        await this.pool.query(
          `UPDATE override_requests SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [requestId]
        );
        return {
          success: false,
          error: 'Request has expired',
        };
      }

      // Validate PIN
      const pinValidation = await this.validateManagerPin(pin, request.required_level || 'manager');

      if (!pinValidation.valid) {
        return {
          success: false,
          error: pinValidation.error,
          lockedUntil: pinValidation.lockedUntil,
        };
      }

      // Log the override
      const logResult = await this.logOverride({
        overrideType: request.override_type,
        thresholdId: request.threshold_id,
        transactionId: request.transaction_id,
        quotationId: request.quotation_id,
        shiftId: request.shift_id,
        registerId: request.register_id,
        cashierId: request.requested_by,
        approvedBy: pinValidation.managerId,
        originalValue: parseFloat(request.original_value),
        overrideValue: parseFloat(request.requested_value),
        wasApproved: approved,
        reason: approved ? request.reason : null,
        denialReason: !approved ? reason : null,
        productId: request.product_id,
        productName: request.product_name,
        quantity: request.quantity,
        requestId,
      });

      return {
        success: true,
        approved,
        logId: logResult.logId,
        managerId: pinValidation.managerId,
        managerName: pinValidation.managerName,
      };
    } catch (error) {
      console.error('[ManagerOverride] resolveRequest error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // THRESHOLD MANAGEMENT
  // ============================================================================

  /**
   * Get all active thresholds
   * @param {string} channel - Channel filter (pos, quote, online)
   * @param {number} categoryId - Optional category ID for category-specific thresholds
   */
  async getActiveThresholds(channel = 'pos', categoryId = null) {
    try {
      // Check cache (only for non-category-specific lookups)
      const cacheKey = `${this.CACHE_KEY_THRESHOLDS}_${channel}`;
      if (this.cache && categoryId === null) {
        const cached = await this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }

      // Query thresholds with category and validity period support
      // Priority: category-specific thresholds > general thresholds
      const result = await this.pool.query(
        `SELECT ot.*,
           c.name as category_name
         FROM override_thresholds ot
         LEFT JOIN categories c ON c.id = ot.category_id
         WHERE ot.is_active = TRUE
         AND (
           ($1 = 'pos' AND ot.applies_to_pos = TRUE) OR
           ($1 = 'quote' AND ot.applies_to_quotes = TRUE) OR
           ($1 = 'online' AND ot.applies_to_online = TRUE)
         )
         AND (ot.valid_from IS NULL OR ot.valid_from <= NOW())
         AND (ot.valid_to IS NULL OR ot.valid_to >= NOW())
         AND (
           ot.category_id IS NULL
           OR ($2::INTEGER IS NOT NULL AND ot.category_id = $2)
         )
         ORDER BY
           CASE WHEN ot.category_id IS NOT NULL THEN 0 ELSE 1 END,
           ot.priority DESC,
           ot.threshold_type`,
        [channel, categoryId]
      );

      const thresholds = result.rows;

      // Cache the result (only for non-category-specific lookups)
      if (this.cache && categoryId === null) {
        await this.cache.setex(cacheKey, this.CACHE_TTL, JSON.stringify(thresholds));
      }

      return thresholds;
    } catch (error) {
      console.error('[ManagerOverride] getActiveThresholds error:', error);
      return [];
    }
  }

  /**
   * Get override thresholds formatted for UI
   */
  async getOverrideThresholds() {
    try {
      const thresholds = await this.getActiveThresholds();

      // Group by type for easier UI consumption
      const grouped = {
        discount: [],
        margin: [],
        voids: [],
        refunds: [],
        other: [],
      };

      for (const t of thresholds) {
        const formatted = {
          id: t.id,
          type: t.threshold_type,
          name: t.name,
          description: t.description,
          value: parseFloat(t.threshold_value) || (t.threshold_value_cents / 100),
          requiredLevel: t.approval_level,
          requireReason: t.require_reason,
        };

        if (['discount_percent', 'discount_amount'].includes(t.threshold_type)) {
          grouped.discount.push(formatted);
        } else if (['margin_below', 'price_below_cost'].includes(t.threshold_type)) {
          grouped.margin.push(formatted);
        } else if (['void_transaction', 'void_item'].includes(t.threshold_type)) {
          grouped.voids.push(formatted);
        } else if (['refund_amount', 'refund_no_receipt'].includes(t.threshold_type)) {
          grouped.refunds.push(formatted);
        } else {
          grouped.other.push(formatted);
        }
      }

      return {
        success: true,
        thresholds: grouped,
        raw: thresholds,
      };
    } catch (error) {
      console.error('[ManagerOverride] getOverrideThresholds error:', error);
      return {
        success: false,
        error: error.message,
        thresholds: {},
      };
    }
  }

  /**
   * Update a threshold
   */
  async updateThreshold(thresholdId, updates) {
    try {
      const allowedFields = [
        'threshold_value', 'threshold_value_cents',
        'requires_approval', 'approval_level', 'require_reason',
        'applies_to_pos', 'applies_to_quotes', 'applies_to_online', 'is_active',
        'active_start_time', 'active_end_time', 'active_days',
        'category_id', 'valid_from', 'valid_to',
        'priority', 'name', 'description',
      ];

      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (setClauses.length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      setClauses.push('updated_at = NOW()');
      values.push(thresholdId);

      const result = await this.pool.query(
        `UPDATE override_thresholds
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      // Clear cache
      if (this.cache) {
        await this.cache.del(`${this.CACHE_KEY_THRESHOLDS}_pos`);
        await this.cache.del(`${this.CACHE_KEY_THRESHOLDS}_quote`);
      }

      return {
        success: true,
        threshold: result.rows[0],
      };
    } catch (error) {
      console.error('[ManagerOverride] updateThreshold error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a new threshold
   */
  async createThreshold(thresholdData) {
    try {
      const {
        thresholdType,
        name,
        description = null,
        thresholdValue = null,
        thresholdValueCents = null,
        requiresApproval = true,
        approvalLevel = 'manager',
        requireReason = false,
        appliesToQuotes = true,
        appliesToPos = true,
        appliesToOnline = false,
        categoryId = null,
        validFrom = null,
        validTo = null,
        activeStartTime = null,
        activeEndTime = null,
        activeDays = null,
        isActive = true,
        priority = 100,
        createdBy = null,
      } = thresholdData;

      const result = await this.pool.query(
        `INSERT INTO override_thresholds (
          threshold_type, name, description,
          threshold_value, threshold_value_cents,
          requires_approval, approval_level, require_reason,
          applies_to_quotes, applies_to_pos, applies_to_online,
          category_id, valid_from, valid_to,
          active_start_time, active_end_time, active_days,
          is_active, priority, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING *`,
        [
          thresholdType, name, description,
          thresholdValue, thresholdValueCents,
          requiresApproval, approvalLevel, requireReason,
          appliesToQuotes, appliesToPos, appliesToOnline,
          categoryId, validFrom, validTo,
          activeStartTime, activeEndTime, activeDays,
          isActive, priority, createdBy,
        ]
      );

      // Clear cache
      if (this.cache) {
        await this.cache.del(`${this.CACHE_KEY_THRESHOLDS}_pos`);
        await this.cache.del(`${this.CACHE_KEY_THRESHOLDS}_quote`);
      }

      return {
        success: true,
        threshold: result.rows[0],
      };
    } catch (error) {
      console.error('[ManagerOverride] createThreshold error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // TIERED APPROVAL LEVELS
  // ============================================================================

  /**
   * Get the required approval level for a given value
   * Uses the threshold_approval_levels table for tiered approvals
   * @param {number} thresholdId - The threshold ID
   * @param {number} value - The value to check
   * @returns {object} { level, maxValue, isUnlimited, allLevels }
   */
  async getRequiredApprovalLevel(thresholdId, value) {
    try {
      // Get all approval levels for this threshold
      const result = await this.pool.query(
        `SELECT approval_level, max_value, max_value_cents, is_unlimited, description
         FROM threshold_approval_levels
         WHERE threshold_id = $1
         ORDER BY
           CASE approval_level
             WHEN 'shift_lead' THEN 1
             WHEN 'manager' THEN 2
             WHEN 'area_manager' THEN 3
             WHEN 'admin' THEN 4
           END`,
        [thresholdId]
      );

      if (result.rows.length === 0) {
        return null; // No tiered levels defined, use default
      }

      const allLevels = result.rows.map((row) => ({
        level: row.approval_level,
        maxValue: parseFloat(row.max_value),
        maxValueCents: row.max_value_cents,
        isUnlimited: row.is_unlimited,
        description: row.description,
      }));

      // Find the lowest level that can approve this value
      for (const level of allLevels) {
        if (level.isUnlimited || level.maxValue >= value) {
          return {
            level: level.level,
            maxValue: level.maxValue,
            isUnlimited: level.isUnlimited,
            allLevels,
          };
        }
      }

      // Default to admin if no level can handle it
      return {
        level: 'admin',
        maxValue: null,
        isUnlimited: true,
        allLevels,
      };
    } catch (error) {
      console.error('[ManagerOverride] getRequiredApprovalLevel error:', error);
      return null;
    }
  }

  /**
   * Check if a user at a given approval level can approve a specific value
   * @param {string} userApprovalLevel - The user's approval level
   * @param {number} thresholdId - The threshold ID
   * @param {number} value - The value to approve
   * @returns {object} { canApprove, maxValue, reason }
   */
  async canUserApproveValue(userApprovalLevel, thresholdId, value) {
    try {
      const result = await this.pool.query(
        `SELECT max_value, max_value_cents, is_unlimited
         FROM threshold_approval_levels
         WHERE threshold_id = $1 AND approval_level = $2`,
        [thresholdId, userApprovalLevel]
      );

      if (result.rows.length === 0) {
        return {
          canApprove: false,
          maxValue: 0,
          reason: 'No approval level configured for this threshold',
        };
      }

      const { max_value, is_unlimited } = result.rows[0];

      if (is_unlimited) {
        return {
          canApprove: true,
          maxValue: null,
          isUnlimited: true,
          reason: null,
        };
      }

      const maxValue = parseFloat(max_value);
      const canApprove = value <= maxValue;

      return {
        canApprove,
        maxValue,
        isUnlimited: false,
        reason: canApprove
          ? null
          : `Value ${value} exceeds your approval limit of ${maxValue}`,
      };
    } catch (error) {
      console.error('[ManagerOverride] canUserApproveValue error:', error);
      return {
        canApprove: false,
        maxValue: 0,
        reason: 'Error checking approval limit',
      };
    }
  }

  /**
   * Get all approval levels for a threshold
   */
  async getThresholdApprovalLevels(thresholdId) {
    try {
      const result = await this.pool.query(
        `SELECT tal.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name
         FROM threshold_approval_levels tal
         LEFT JOIN users u ON u.id = tal.created_by
         WHERE tal.threshold_id = $1
         ORDER BY
           CASE tal.approval_level
             WHEN 'shift_lead' THEN 1
             WHEN 'manager' THEN 2
             WHEN 'area_manager' THEN 3
             WHEN 'admin' THEN 4
           END`,
        [thresholdId]
      );

      return {
        success: true,
        levels: result.rows.map((row) => ({
          id: row.id,
          thresholdId: row.threshold_id,
          approvalLevel: row.approval_level,
          maxValue: parseFloat(row.max_value),
          maxValueCents: row.max_value_cents,
          isUnlimited: row.is_unlimited,
          description: row.description,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    } catch (error) {
      console.error('[ManagerOverride] getThresholdApprovalLevels error:', error);
      return {
        success: false,
        error: error.message,
        levels: [],
      };
    }
  }

  /**
   * Set/update approval level for a threshold
   */
  async setThresholdApprovalLevel(thresholdId, approvalLevel, maxValue, options = {}) {
    try {
      const {
        maxValueCents = null,
        isUnlimited = false,
        description = null,
      } = options;

      const result = await this.pool.query(
        `INSERT INTO threshold_approval_levels (
          threshold_id, approval_level, max_value, max_value_cents, is_unlimited, description
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (threshold_id, approval_level)
        DO UPDATE SET
          max_value = EXCLUDED.max_value,
          max_value_cents = EXCLUDED.max_value_cents,
          is_unlimited = EXCLUDED.is_unlimited,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING *`,
        [thresholdId, approvalLevel, maxValue, maxValueCents, isUnlimited, description]
      );

      return {
        success: true,
        level: result.rows[0],
      };
    } catch (error) {
      console.error('[ManagerOverride] setThresholdApprovalLevel error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete an approval level from a threshold
   */
  async deleteThresholdApprovalLevel(thresholdId, approvalLevel) {
    try {
      await this.pool.query(
        'DELETE FROM threshold_approval_levels WHERE threshold_id = $1 AND approval_level = $2',
        [thresholdId, approvalLevel]
      );

      return { success: true };
    } catch (error) {
      console.error('[ManagerOverride] deleteThresholdApprovalLevel error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get thresholds with full configuration (including approval levels)
   * Used by admin UI
   */
  async getThresholdsWithConfig(options = {}) {
    try {
      const { channel, includeInactive = false, categoryId = null } = options;

      let query = `
        SELECT
          ot.*,
          c.name as category_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', tal.id,
                'level', tal.approval_level,
                'maxValue', tal.max_value,
                'maxValueCents', tal.max_value_cents,
                'isUnlimited', tal.is_unlimited,
                'description', tal.description
              )
              ORDER BY
                CASE tal.approval_level
                  WHEN 'shift_lead' THEN 1
                  WHEN 'manager' THEN 2
                  WHEN 'area_manager' THEN 3
                  WHEN 'admin' THEN 4
                END
            ) FILTER (WHERE tal.id IS NOT NULL),
            '[]'::json
          ) AS approval_levels
        FROM override_thresholds ot
        LEFT JOIN categories c ON c.id = ot.category_id
        LEFT JOIN threshold_approval_levels tal ON tal.threshold_id = ot.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (!includeInactive) {
        query += ' AND ot.is_active = TRUE';
      }

      if (channel) {
        query += ` AND (
          ($${paramIndex} = 'pos' AND ot.applies_to_pos = TRUE) OR
          ($${paramIndex} = 'quote' AND ot.applies_to_quotes = TRUE) OR
          ($${paramIndex} = 'online' AND ot.applies_to_online = TRUE)
        )`;
        params.push(channel);
        paramIndex++;
      }

      if (categoryId !== null) {
        query += ` AND (ot.category_id IS NULL OR ot.category_id = $${paramIndex})`;
        params.push(categoryId);
        paramIndex++;
      }

      query += `
        GROUP BY ot.id, c.name
        ORDER BY ot.priority DESC, ot.threshold_type, ot.name
      `;

      const result = await this.pool.query(query, params);

      return {
        success: true,
        thresholds: result.rows.map((row) => ({
          id: row.id,
          thresholdType: row.threshold_type,
          name: row.name,
          description: row.description,
          thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : null,
          thresholdValueCents: row.threshold_value_cents,
          requiresApproval: row.requires_approval,
          defaultApprovalLevel: row.approval_level,
          requireReason: row.require_reason,
          appliesToQuotes: row.applies_to_quotes,
          appliesToPos: row.applies_to_pos,
          appliesToOnline: row.applies_to_online,
          categoryId: row.category_id,
          categoryName: row.category_name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          activeStartTime: row.active_start_time,
          activeEndTime: row.active_end_time,
          activeDays: row.active_days,
          isActive: row.is_active,
          priority: row.priority,
          approvalLevels: row.approval_levels,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    } catch (error) {
      console.error('[ManagerOverride] getThresholdsWithConfig error:', error);
      return {
        success: false,
        error: error.message,
        thresholds: [],
      };
    }
  }

  // ============================================================================
  // AUDIT & REPORTING
  // ============================================================================

  /**
   * Get override history with filters
   */
  async getOverrideHistory(options = {}) {
    try {
      const {
        startDate,
        endDate,
        overrideType,
        managerId,
        cashierId,
        wasApproved,
        limit = 100,
        offset = 0,
      } = options;

      let query = `
        SELECT
          ol.*,
          CONCAT(m.first_name, ' ', m.last_name) as manager_name,
          CONCAT(c.first_name, ' ', c.last_name) as cashier_name,
          ot.name as threshold_name
        FROM override_log ol
        LEFT JOIN users m ON ol.approved_by = m.id
        LEFT JOIN users c ON ol.cashier_id = c.id
        LEFT JOIN override_thresholds ot ON ol.threshold_id = ot.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND ol.approved_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND ol.approved_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      if (overrideType) {
        query += ` AND ol.override_type = $${paramIndex++}`;
        params.push(overrideType);
      }

      if (managerId) {
        query += ` AND ol.approved_by = $${paramIndex++}`;
        params.push(managerId);
      }

      if (cashierId) {
        query += ` AND ol.cashier_id = $${paramIndex++}`;
        params.push(cashierId);
      }

      if (wasApproved !== undefined) {
        query += ` AND ol.was_approved = $${paramIndex++}`;
        params.push(wasApproved);
      }

      query += ` ORDER BY ol.approved_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) FROM override_log ol WHERE 1=1
      `;
      const countParams = params.slice(0, -2); // Remove limit and offset
      // Rebuild conditions for count
      let countParamIndex = 1;
      if (startDate) countQuery += ` AND ol.approved_at >= $${countParamIndex++}`;
      if (endDate) countQuery += ` AND ol.approved_at <= $${countParamIndex++}`;
      if (overrideType) countQuery += ` AND ol.override_type = $${countParamIndex++}`;
      if (managerId) countQuery += ` AND ol.approved_by = $${countParamIndex++}`;
      if (cashierId) countQuery += ` AND ol.cashier_id = $${countParamIndex++}`;
      if (wasApproved !== undefined) countQuery += ` AND ol.was_approved = $${countParamIndex++}`;

      const countResult = await this.pool.query(countQuery, countParams);

      return {
        success: true,
        overrides: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        limit,
        offset,
      };
    } catch (error) {
      console.error('[ManagerOverride] getOverrideHistory error:', error);
      return {
        success: false,
        error: error.message,
        overrides: [],
      };
    }
  }

  /**
   * Get summary statistics for overrides
   */
  async getOverrideSummary(options = {}) {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;

      const dateFormat = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

      let query = `
        SELECT
          TO_CHAR(approved_at, '${dateFormat}') as period,
          override_type,
          COUNT(*) as total_count,
          SUM(CASE WHEN was_approved THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN NOT was_approved THEN 1 ELSE 0 END) as denied_count,
          ROUND(AVG(ABS(difference_value))::NUMERIC, 2) as avg_difference,
          ROUND(SUM(ABS(difference_value))::NUMERIC, 2) as total_difference
        FROM override_log
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND approved_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND approved_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` GROUP BY period, override_type ORDER BY period DESC, override_type`;

      const result = await this.pool.query(query, params);

      return {
        success: true,
        summary: result.rows,
      };
    } catch (error) {
      console.error('[ManagerOverride] getOverrideSummary error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  async _checkException(thresholdId, context) {
    try {
      const { productId, categoryName, customerId, customerTier, userId } = context;

      const result = await this.pool.query(
        `SELECT * FROM override_threshold_exceptions
         WHERE threshold_id = $1
         AND is_active = TRUE
         AND (valid_until IS NULL OR valid_until > NOW())
         AND (
           (exception_type = 'product' AND product_id = $2) OR
           (exception_type = 'category' AND category_name = $3) OR
           (exception_type = 'customer' AND customer_id = $4) OR
           (exception_type = 'customer_tier' AND customer_tier = $5) OR
           (exception_type = 'user' AND user_id = $6)
         )
         LIMIT 1`,
        [thresholdId, productId, categoryName, customerId, customerTier, userId]
      );

      return result.rows.length > 0 && result.rows[0].is_exempt;
    } catch (error) {
      console.error('[ManagerOverride] _checkException error:', error);
      return false;
    }
  }

  async _recordFailedAttempt(pinId, maxAttempts = DEFAULT_MAX_ATTEMPTS, lockoutMinutes = DEFAULT_LOCKOUT_MINUTES) {
    await this.pool.query(
      `UPDATE manager_pins
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE
             WHEN failed_attempts + 1 >= $2
             THEN NOW() + INTERVAL '${lockoutMinutes} minutes'
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [pinId, maxAttempts]
    );
  }

  async _resetFailedAttempts(pinId) {
    await this.pool.query(
      `UPDATE manager_pins
       SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [pinId]
    );
  }

  async _recordPinUsage(pinId) {
    await this.pool.query(
      `UPDATE manager_pins
       SET failed_attempts = 0,
           locked_until = NULL,
           last_used_at = NOW(),
           override_count_today = CASE
             WHEN last_override_date = CURRENT_DATE THEN override_count_today + 1
             ELSE 1
           END,
           last_override_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [pinId]
    );
  }

  _formatOverrideType(type) {
    const labels = {
      discount_percent: 'Percentage Discount',
      discount_amount: 'Amount Discount',
      margin_below: 'Low Margin',
      price_below_cost: 'Below Cost Sale',
      price_override: 'Price Override',
      void_transaction: 'Void Transaction',
      void_item: 'Void Item',
      refund_amount: 'Refund',
      refund_no_receipt: 'No Receipt Refund',
      drawer_adjustment: 'Drawer Adjustment',
      negative_inventory: 'Negative Inventory',
    };
    return labels[type] || type;
  }
}

module.exports = ManagerOverrideService;
