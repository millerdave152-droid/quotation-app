/**
 * TeleTime POS - Admin Approval Rules Routes
 * API endpoints for managing override approval thresholds
 */

const express = require('express');
const router = express.Router();

/**
 * Validation helpers
 */
const VALID_THRESHOLD_TYPES = [
  'discount_percent',
  'discount_amount',
  'margin_below',
  'price_below_cost',
  'price_override',
  'void_transaction',
  'void_item',
  'refund_amount',
  'refund_no_receipt',
  'drawer_adjustment',
  'negative_inventory',
];

const VALID_APPROVAL_LEVELS = ['shift_lead', 'manager', 'area_manager', 'admin'];

/**
 * Validate rule data
 */
function validateRuleData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.thresholdType) {
      errors.push('thresholdType is required');
    } else if (!VALID_THRESHOLD_TYPES.includes(data.thresholdType)) {
      errors.push(`Invalid thresholdType. Must be one of: ${VALID_THRESHOLD_TYPES.join(', ')}`);
    }

    if (!data.name || data.name.trim().length === 0) {
      errors.push('name is required');
    }
  }

  // Validate threshold value based on type
  if (data.thresholdType && !['void_transaction', 'void_item', 'refund_no_receipt', 'drawer_adjustment', 'price_below_cost'].includes(data.thresholdType)) {
    if (data.thresholdValue === undefined && data.thresholdValueCents === undefined && !isUpdate) {
      errors.push('thresholdValue or thresholdValueCents is required for this threshold type');
    }
  }

  // Validate date range
  if (data.validFrom && data.validTo) {
    const from = new Date(data.validFrom);
    const to = new Date(data.validTo);
    if (from >= to) {
      errors.push('validFrom must be before validTo');
    }
  }

  // Validate time range
  if (data.activeStartTime && data.activeEndTime) {
    if (data.activeStartTime >= data.activeEndTime) {
      errors.push('activeStartTime must be before activeEndTime');
    }
  }

  // Validate active days
  if (data.activeDays && Array.isArray(data.activeDays)) {
    const invalidDays = data.activeDays.filter((d) => d < 0 || d > 6);
    if (invalidDays.length > 0) {
      errors.push('activeDays must contain values 0-6 (Sunday-Saturday)');
    }
  }

  // Validate approval levels if provided
  if (data.approvalLevels && Array.isArray(data.approvalLevels)) {
    for (const level of data.approvalLevels) {
      if (!VALID_APPROVAL_LEVELS.includes(level.level)) {
        errors.push(`Invalid approval level: ${level.level}`);
      }
      if (!level.isUnlimited && (level.maxValue === undefined || level.maxValue <= 0)) {
        errors.push(`maxValue must be positive for level ${level.level}`);
      }
    }
  }

  return errors;
}

/**
 * Initialize routes with pool
 * @param {Pool} pool - PostgreSQL pool
 */
module.exports = function (pool) {
  // ============================================================================
  // LIST RULES
  // ============================================================================

  /**
   * GET /api/admin/approval-rules
   * List all approval rules with filters
   */
  router.get('/', async (req, res) => {
    try {
      const {
        thresholdType,
        categoryId,
        isActive,
        channel,
        includeDeleted = 'false',
        sortBy = 'priority',
        sortOrder = 'desc',
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `
        SELECT
          ot.id,
          ot.threshold_type,
          ot.name,
          ot.description,
          ot.threshold_value,
          ot.threshold_value_cents,
          ot.requires_approval,
          ot.approval_level AS default_approval_level,
          ot.require_reason,
          ot.applies_to_quotes,
          ot.applies_to_pos,
          ot.applies_to_online,
          ot.category_id,
          c.name AS category_name,
          ot.valid_from,
          ot.valid_to,
          ot.active_start_time,
          ot.active_end_time,
          ot.active_days,
          ot.is_active,
          ot.priority,
          ot.created_at,
          ot.updated_at,
          ot.created_by,
          u.name AS created_by_name,
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
        LEFT JOIN users u ON u.id = ot.created_by
        LEFT JOIN threshold_approval_levels tal ON tal.threshold_id = ot.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      // Apply filters
      if (includeDeleted !== 'true') {
        query += ' AND ot.is_active IS NOT NULL'; // Soft-deleted items would have is_active = NULL
      }

      if (thresholdType) {
        query += ` AND ot.threshold_type = $${paramIndex++}`;
        params.push(thresholdType);
      }

      if (categoryId) {
        if (categoryId === 'null') {
          query += ' AND ot.category_id IS NULL';
        } else {
          query += ` AND ot.category_id = $${paramIndex++}`;
          params.push(parseInt(categoryId, 10));
        }
      }

      if (isActive !== undefined) {
        query += ` AND ot.is_active = $${paramIndex++}`;
        params.push(isActive === 'true');
      }

      if (channel) {
        if (channel === 'pos') {
          query += ' AND ot.applies_to_pos = TRUE';
        } else if (channel === 'quote') {
          query += ' AND ot.applies_to_quotes = TRUE';
        } else if (channel === 'online') {
          query += ' AND ot.applies_to_online = TRUE';
        }
      }

      // Group by for aggregation
      query += `
        GROUP BY ot.id, c.name, u.name
      `;

      // Sorting
      const validSortColumns = ['priority', 'name', 'threshold_type', 'created_at', 'updated_at'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'priority';
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      query += ` ORDER BY ot.${sortColumn} ${order}, ot.id`;

      // Pagination
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(DISTINCT ot.id)
        FROM override_thresholds ot
        WHERE 1=1
      `;
      const countParams = [];
      let countParamIndex = 1;

      if (includeDeleted !== 'true') {
        countQuery += ' AND ot.is_active IS NOT NULL';
      }
      if (thresholdType) {
        countQuery += ` AND ot.threshold_type = $${countParamIndex++}`;
        countParams.push(thresholdType);
      }
      if (categoryId) {
        if (categoryId === 'null') {
          countQuery += ' AND ot.category_id IS NULL';
        } else {
          countQuery += ` AND ot.category_id = $${countParamIndex++}`;
          countParams.push(parseInt(categoryId, 10));
        }
      }
      if (isActive !== undefined) {
        countQuery += ` AND ot.is_active = $${countParamIndex++}`;
        countParams.push(isActive === 'true');
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      // Format response
      const rules = result.rows.map((row) => ({
        id: row.id,
        thresholdType: row.threshold_type,
        name: row.name,
        description: row.description,
        thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : null,
        thresholdValueCents: row.threshold_value_cents,
        requiresApproval: row.requires_approval,
        defaultApprovalLevel: row.default_approval_level,
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
        createdBy: row.created_by,
        createdByName: row.created_by_name,
      }));

      res.json({
        success: true,
        data: rules,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          hasMore: parseInt(offset, 10) + rules.length < total,
        },
      });
    } catch (error) {
      console.error('[Admin Approval Rules] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // GET EFFECTIVE RULES
  // ============================================================================

  /**
   * GET /api/admin/approval-rules/effective
   * Get currently active rules for a category (considering date validity)
   */
  router.get('/effective', async (req, res) => {
    try {
      const { categoryId, channel = 'pos', thresholdType } = req.query;

      let query = `
        SELECT
          ot.id,
          ot.threshold_type,
          ot.name,
          ot.description,
          ot.threshold_value,
          ot.threshold_value_cents,
          ot.requires_approval,
          ot.approval_level AS default_approval_level,
          ot.require_reason,
          ot.category_id,
          c.name AS category_name,
          ot.valid_from,
          ot.valid_to,
          ot.active_start_time,
          ot.active_end_time,
          ot.active_days,
          ot.priority,
          COALESCE(
            json_agg(
              json_build_object(
                'level', tal.approval_level,
                'maxValue', tal.max_value,
                'isUnlimited', tal.is_unlimited
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
        WHERE ot.is_active = TRUE
          AND ot.requires_approval = TRUE
          AND (ot.valid_from IS NULL OR ot.valid_from <= NOW())
          AND (ot.valid_to IS NULL OR ot.valid_to >= NOW())
      `;
      const params = [];
      let paramIndex = 1;

      // Channel filter
      if (channel === 'pos') {
        query += ' AND ot.applies_to_pos = TRUE';
      } else if (channel === 'quote') {
        query += ' AND ot.applies_to_quotes = TRUE';
      } else if (channel === 'online') {
        query += ' AND ot.applies_to_online = TRUE';
      }

      // Category filter - include global rules (null) and category-specific
      if (categoryId) {
        query += ` AND (ot.category_id IS NULL OR ot.category_id = $${paramIndex++})`;
        params.push(parseInt(categoryId, 10));
      }

      if (thresholdType) {
        query += ` AND ot.threshold_type = $${paramIndex++}`;
        params.push(thresholdType);
      }

      query += `
        GROUP BY ot.id, c.name
        ORDER BY
          CASE WHEN ot.category_id IS NOT NULL THEN 0 ELSE 1 END,
          ot.priority DESC,
          ot.threshold_type
      `;

      const result = await pool.query(query, params);

      // Check time-of-day and day-of-week restrictions
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8);
      const currentDay = now.getDay();

      const effectiveRules = result.rows
        .filter((row) => {
          // Check time-of-day restrictions
          if (row.active_start_time && row.active_end_time) {
            if (currentTime < row.active_start_time || currentTime > row.active_end_time) {
              return false;
            }
          }

          // Check day-of-week restrictions
          if (row.active_days && row.active_days.length > 0) {
            if (!row.active_days.includes(currentDay)) {
              return false;
            }
          }

          return true;
        })
        .map((row) => ({
          id: row.id,
          thresholdType: row.threshold_type,
          name: row.name,
          description: row.description,
          thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : null,
          thresholdValueCents: row.threshold_value_cents,
          requiresApproval: row.requires_approval,
          defaultApprovalLevel: row.default_approval_level,
          requireReason: row.require_reason,
          categoryId: row.category_id,
          categoryName: row.category_name,
          approvalLevels: row.approval_levels,
          priority: row.priority,
          isGlobal: row.category_id === null,
        }));

      res.json({
        success: true,
        data: effectiveRules,
        meta: {
          evaluatedAt: now.toISOString(),
          categoryId: categoryId ? parseInt(categoryId, 10) : null,
          channel,
        },
      });
    } catch (error) {
      console.error('[Admin Approval Rules] Get effective error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // GET SINGLE RULE
  // ============================================================================

  /**
   * GET /api/admin/approval-rules/:id
   * Get single rule details
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `
        SELECT
          ot.*,
          c.name AS category_name,
          u.name AS created_by_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', tal.id,
                'level', tal.approval_level,
                'maxValue', tal.max_value,
                'maxValueCents', tal.max_value_cents,
                'isUnlimited', tal.is_unlimited,
                'description', tal.description,
                'createdAt', tal.created_at,
                'updatedAt', tal.updated_at
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
        LEFT JOIN users u ON u.id = ot.created_by
        LEFT JOIN threshold_approval_levels tal ON tal.threshold_id = ot.id
        WHERE ot.id = $1
        GROUP BY ot.id, c.name, u.name
        `,
        [parseInt(id, 10)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Approval rule not found',
        });
      }

      const row = result.rows[0];

      // Get audit log for this rule
      const auditResult = await pool.query(
        `
        SELECT
          al.id,
          al.action,
          al.changes,
          al.created_at,
          u.name AS admin_name
        FROM approval_rule_audit_log al
        LEFT JOIN users u ON u.id = al.admin_id
        WHERE al.rule_id = $1
        ORDER BY al.created_at DESC
        LIMIT 20
        `,
        [parseInt(id, 10)]
      );

      res.json({
        success: true,
        data: {
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
          createdBy: row.created_by,
          createdByName: row.created_by_name,
        },
        auditLog: auditResult.rows,
      });
    } catch (error) {
      console.error('[Admin Approval Rules] Get single error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // CREATE RULE
  // ============================================================================

  /**
   * POST /api/admin/approval-rules
   * Create new approval rule
   */
  router.post('/', async (req, res) => {
    const client = await pool.connect();

    try {
      const adminId = req.user?.id;
      const data = req.body;

      // Validate input
      const validationErrors = validateRuleData(data, false);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: validationErrors,
        });
      }

      // Check for at least one approval level
      if (!data.approvalLevels || data.approvalLevels.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one approval level is required',
        });
      }

      await client.query('BEGIN');

      // Check for conflicting rules (same category + overlapping dates)
      const conflictQuery = `
        SELECT id, name, valid_from, valid_to
        FROM override_thresholds
        WHERE threshold_type = $1
          AND is_active = TRUE
          AND (
            ($2::INTEGER IS NULL AND category_id IS NULL)
            OR ($2::INTEGER IS NOT NULL AND category_id = $2)
          )
          AND (
            -- Check date overlap
            ($3::TIMESTAMPTZ IS NULL AND $4::TIMESTAMPTZ IS NULL)
            OR (valid_from IS NULL AND valid_to IS NULL)
            OR (
              ($3::TIMESTAMPTZ IS NULL OR valid_to IS NULL OR $3 <= valid_to)
              AND ($4::TIMESTAMPTZ IS NULL OR valid_from IS NULL OR $4 >= valid_from)
            )
          )
      `;

      const conflictResult = await client.query(conflictQuery, [
        data.thresholdType,
        data.categoryId || null,
        data.validFrom || null,
        data.validTo || null,
      ]);

      if (conflictResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Conflicting rule exists for this category and date range',
          conflicts: conflictResult.rows,
        });
      }

      // Insert the rule
      const insertResult = await client.query(
        `
        INSERT INTO override_thresholds (
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
        ) RETURNING id
        `,
        [
          data.thresholdType,
          data.name,
          data.description || null,
          data.thresholdValue || null,
          data.thresholdValueCents || null,
          data.requiresApproval !== false,
          data.defaultApprovalLevel || 'manager',
          data.requireReason || false,
          data.appliesToQuotes !== false,
          data.appliesToPos !== false,
          data.appliesToOnline || false,
          data.categoryId || null,
          data.validFrom || null,
          data.validTo || null,
          data.activeStartTime || null,
          data.activeEndTime || null,
          data.activeDays || null,
          data.isActive !== false,
          data.priority || 100,
          adminId,
        ]
      );

      const ruleId = insertResult.rows[0].id;

      // Insert approval levels
      for (const level of data.approvalLevels) {
        await client.query(
          `
          INSERT INTO threshold_approval_levels (
            threshold_id, approval_level, max_value, max_value_cents, is_unlimited, description
          ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            ruleId,
            level.level,
            level.isUnlimited ? 999999.99 : level.maxValue,
            level.maxValueCents || null,
            level.isUnlimited || false,
            level.description || null,
          ]
        );
      }

      // Log the creation
      await client.query(
        `
        INSERT INTO approval_rule_audit_log (rule_id, admin_id, action, changes)
        VALUES ($1, $2, 'create', $3)
        `,
        [ruleId, adminId, JSON.stringify(data)]
      );

      await client.query('COMMIT');

      // Fetch the created rule
      const createdRule = await pool.query(
        `
        SELECT ot.*, c.name AS category_name
        FROM override_thresholds ot
        LEFT JOIN categories c ON c.id = ot.category_id
        WHERE ot.id = $1
        `,
        [ruleId]
      );

      res.status(201).json({
        success: true,
        data: {
          id: ruleId,
          ...createdRule.rows[0],
        },
        message: 'Approval rule created successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Admin Approval Rules] Create error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // UPDATE RULE
  // ============================================================================

  /**
   * PUT /api/admin/approval-rules/:id
   * Update approval rule
   */
  router.put('/:id', async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      const data = req.body;

      // Validate input
      const validationErrors = validateRuleData(data, true);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: validationErrors,
        });
      }

      await client.query('BEGIN');

      // Check rule exists
      const existingResult = await client.query(
        'SELECT * FROM override_thresholds WHERE id = $1',
        [parseInt(id, 10)]
      );

      if (existingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Approval rule not found',
        });
      }

      const existingRule = existingResult.rows[0];

      // Check for conflicting rules if category or dates changed
      if (
        data.categoryId !== undefined ||
        data.validFrom !== undefined ||
        data.validTo !== undefined
      ) {
        const conflictQuery = `
          SELECT id, name, valid_from, valid_to
          FROM override_thresholds
          WHERE id != $1
            AND threshold_type = $2
            AND is_active = TRUE
            AND (
              ($3::INTEGER IS NULL AND category_id IS NULL)
              OR ($3::INTEGER IS NOT NULL AND category_id = $3)
            )
            AND (
              ($4::TIMESTAMPTZ IS NULL AND $5::TIMESTAMPTZ IS NULL)
              OR (valid_from IS NULL AND valid_to IS NULL)
              OR (
                ($4::TIMESTAMPTZ IS NULL OR valid_to IS NULL OR $4 <= valid_to)
                AND ($5::TIMESTAMPTZ IS NULL OR valid_from IS NULL OR $5 >= valid_from)
              )
            )
        `;

        const conflictResult = await client.query(conflictQuery, [
          parseInt(id, 10),
          existingRule.threshold_type,
          data.categoryId !== undefined ? data.categoryId : existingRule.category_id,
          data.validFrom !== undefined ? data.validFrom : existingRule.valid_from,
          data.validTo !== undefined ? data.validTo : existingRule.valid_to,
        ]);

        if (conflictResult.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            error: 'Conflicting rule exists for this category and date range',
            conflicts: conflictResult.rows,
          });
        }
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      const fieldMappings = {
        name: 'name',
        description: 'description',
        thresholdValue: 'threshold_value',
        thresholdValueCents: 'threshold_value_cents',
        requiresApproval: 'requires_approval',
        defaultApprovalLevel: 'approval_level',
        requireReason: 'require_reason',
        appliesToQuotes: 'applies_to_quotes',
        appliesToPos: 'applies_to_pos',
        appliesToOnline: 'applies_to_online',
        categoryId: 'category_id',
        validFrom: 'valid_from',
        validTo: 'valid_to',
        activeStartTime: 'active_start_time',
        activeEndTime: 'active_end_time',
        activeDays: 'active_days',
        isActive: 'is_active',
        priority: 'priority',
      };

      for (const [jsKey, dbKey] of Object.entries(fieldMappings)) {
        if (data[jsKey] !== undefined) {
          updateFields.push(`${dbKey} = $${paramIndex++}`);
          updateValues.push(data[jsKey]);
        }
      }

      if (updateFields.length === 0 && !data.approvalLevels) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'No fields to update',
        });
      }

      // Update rule if there are field changes
      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        updateValues.push(parseInt(id, 10));

        await client.query(
          `UPDATE override_thresholds SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
          updateValues
        );
      }

      // Update approval levels if provided
      if (data.approvalLevels && Array.isArray(data.approvalLevels)) {
        // Ensure at least one level
        if (data.approvalLevels.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: 'At least one approval level is required',
          });
        }

        // Delete existing levels
        await client.query(
          'DELETE FROM threshold_approval_levels WHERE threshold_id = $1',
          [parseInt(id, 10)]
        );

        // Insert new levels
        for (const level of data.approvalLevels) {
          await client.query(
            `
            INSERT INTO threshold_approval_levels (
              threshold_id, approval_level, max_value, max_value_cents, is_unlimited, description
            ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              parseInt(id, 10),
              level.level,
              level.isUnlimited ? 999999.99 : level.maxValue,
              level.maxValueCents || null,
              level.isUnlimited || false,
              level.description || null,
            ]
          );
        }
      }

      // Log the update
      const changes = {
        before: existingRule,
        after: data,
      };

      await client.query(
        `
        INSERT INTO approval_rule_audit_log (rule_id, admin_id, action, changes)
        VALUES ($1, $2, 'update', $3)
        `,
        [parseInt(id, 10), adminId, JSON.stringify(changes)]
      );

      await client.query('COMMIT');

      // Fetch updated rule
      const updatedResult = await pool.query(
        `
        SELECT ot.*, c.name AS category_name
        FROM override_thresholds ot
        LEFT JOIN categories c ON c.id = ot.category_id
        WHERE ot.id = $1
        `,
        [parseInt(id, 10)]
      );

      res.json({
        success: true,
        data: updatedResult.rows[0],
        message: 'Approval rule updated successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Admin Approval Rules] Update error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // DELETE RULE (SOFT DELETE)
  // ============================================================================

  /**
   * DELETE /api/admin/approval-rules/:id
   * Soft delete approval rule (keep for audit)
   */
  router.delete('/:id', async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const adminId = req.user?.id;

      await client.query('BEGIN');

      // Check rule exists
      const existingResult = await client.query(
        'SELECT * FROM override_thresholds WHERE id = $1',
        [parseInt(id, 10)]
      );

      if (existingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Approval rule not found',
        });
      }

      const existingRule = existingResult.rows[0];

      // Soft delete - set is_active to false and add deleted_at timestamp
      await client.query(
        `
        UPDATE override_thresholds
        SET is_active = FALSE,
            updated_at = NOW(),
            name = name || ' [DELETED ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ']'
        WHERE id = $1
        `,
        [parseInt(id, 10)]
      );

      // Log the deletion
      await client.query(
        `
        INSERT INTO approval_rule_audit_log (rule_id, admin_id, action, changes)
        VALUES ($1, $2, 'delete', $3)
        `,
        [parseInt(id, 10), adminId, JSON.stringify({ deleted: existingRule })]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Approval rule deleted successfully',
        data: {
          id: parseInt(id, 10),
          deletedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Admin Approval Rules] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * POST /api/admin/approval-rules/bulk-update
   * Update multiple rules at once (e.g., activate/deactivate)
   */
  router.post('/bulk-update', async (req, res) => {
    const client = await pool.connect();

    try {
      const adminId = req.user?.id;
      const { ruleIds, updates } = req.body;

      if (!ruleIds || !Array.isArray(ruleIds) || ruleIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'ruleIds array is required',
        });
      }

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'updates object is required',
        });
      }

      // Only allow certain fields for bulk update
      const allowedBulkFields = ['isActive', 'requiresApproval', 'priority'];
      const invalidFields = Object.keys(updates).filter(
        (k) => !allowedBulkFields.includes(k)
      );

      if (invalidFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid fields for bulk update: ${invalidFields.join(', ')}. Allowed: ${allowedBulkFields.join(', ')}`,
        });
      }

      await client.query('BEGIN');

      // Build update query
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (updates.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);
      }
      if (updates.requiresApproval !== undefined) {
        setClauses.push(`requires_approval = $${paramIndex++}`);
        values.push(updates.requiresApproval);
      }
      if (updates.priority !== undefined) {
        setClauses.push(`priority = $${paramIndex++}`);
        values.push(updates.priority);
      }

      setClauses.push('updated_at = NOW()');

      // Update all specified rules
      const result = await client.query(
        `
        UPDATE override_thresholds
        SET ${setClauses.join(', ')}
        WHERE id = ANY($${paramIndex})
        RETURNING id
        `,
        [...values, ruleIds]
      );

      // Log the bulk update
      await client.query(
        `
        INSERT INTO approval_rule_audit_log (rule_id, admin_id, action, changes)
        SELECT unnest($1::INTEGER[]), $2, 'bulk_update', $3
        `,
        [ruleIds, adminId, JSON.stringify({ ruleIds, updates })]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Updated ${result.rowCount} rules`,
        data: {
          updatedIds: result.rows.map((r) => r.id),
          updates,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Admin Approval Rules] Bulk update error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/admin/approval-rules/:id/duplicate
   * Duplicate a rule (useful for creating category-specific versions)
   */
  router.post('/:id/duplicate', async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      const { newName, categoryId } = req.body;

      await client.query('BEGIN');

      // Get source rule
      const sourceResult = await client.query(
        `
        SELECT ot.*
        FROM override_thresholds ot
        WHERE ot.id = $1
        `,
        [parseInt(id, 10)]
      );

      if (sourceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Source rule not found',
        });
      }

      const source = sourceResult.rows[0];

      // Create duplicate
      const insertResult = await client.query(
        `
        INSERT INTO override_thresholds (
          threshold_type, name, description,
          threshold_value, threshold_value_cents,
          requires_approval, approval_level, require_reason,
          applies_to_quotes, applies_to_pos, applies_to_online,
          category_id, valid_from, valid_to,
          active_start_time, active_end_time, active_days,
          is_active, priority, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, FALSE, $18, $19
        ) RETURNING id
        `,
        [
          source.threshold_type,
          newName || `${source.name} (Copy)`,
          source.description,
          source.threshold_value,
          source.threshold_value_cents,
          source.requires_approval,
          source.approval_level,
          source.require_reason,
          source.applies_to_quotes,
          source.applies_to_pos,
          source.applies_to_online,
          categoryId !== undefined ? categoryId : source.category_id,
          source.valid_from,
          source.valid_to,
          source.active_start_time,
          source.active_end_time,
          source.active_days,
          source.priority,
          adminId,
        ]
      );

      const newRuleId = insertResult.rows[0].id;

      // Copy approval levels
      await client.query(
        `
        INSERT INTO threshold_approval_levels (
          threshold_id, approval_level, max_value, max_value_cents, is_unlimited, description
        )
        SELECT $1, approval_level, max_value, max_value_cents, is_unlimited, description
        FROM threshold_approval_levels
        WHERE threshold_id = $2
        `,
        [newRuleId, parseInt(id, 10)]
      );

      // Log the duplication
      await client.query(
        `
        INSERT INTO approval_rule_audit_log (rule_id, admin_id, action, changes)
        VALUES ($1, $2, 'duplicate', $3)
        `,
        [newRuleId, adminId, JSON.stringify({ sourceRuleId: parseInt(id, 10), newName, categoryId })]
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Rule duplicated successfully',
        data: {
          id: newRuleId,
          sourceId: parseInt(id, 10),
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Admin Approval Rules] Duplicate error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
};
