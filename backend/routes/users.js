/**
 * User Management Routes
 * CRUD operations for users and approval settings
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * @route   GET /api/users
 * @desc    Get all users (admin/manager only)
 * @access  Private (admin, manager)
 */
router.get('/', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { role, search, includeInactive } = req.query;

    let query = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.is_active,
        u.department,
        u.job_title,
        u.phone,
        u.approval_threshold_percent,
        u.can_approve_quotes,
        u.max_approval_amount_cents,
        u.manager_id,
        u.created_at,
        u.last_login,
        m.first_name || ' ' || m.last_name as manager_name,
        (SELECT COUNT(*) FROM quotations WHERE created_by = u.email) as quote_count
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by role
    if (role) {
      query += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    // Filter by active status
    if (!includeInactive || includeInactive === 'false') {
      query += ` AND u.is_active = true`;
    }

    // Search by name or email
    if (search) {
      query += ` AND (
        u.email ILIKE $${paramIndex} OR
        u.first_name ILIKE $${paramIndex} OR
        u.last_name ILIKE $${paramIndex} OR
        (u.first_name || ' ' || u.last_name) ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        users: result.rows.map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          department: user.department,
          jobTitle: user.job_title,
          phone: user.phone,
          approvalThresholdPercent: parseFloat(user.approval_threshold_percent) || null,
          canApproveQuotes: user.can_approve_quotes,
          maxApprovalAmountCents: user.max_approval_amount_cents,
          managerId: user.manager_id,
          managerName: user.manager_name,
          quoteCount: parseInt(user.quote_count) || 0,
          createdAt: user.created_at,
          lastLogin: user.last_login
        })),
        total: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.is_active,
        u.department,
        u.job_title,
        u.phone,
        u.approval_threshold_percent,
        u.can_approve_quotes,
        u.max_approval_amount_cents,
        u.manager_id,
        u.created_at,
        u.last_login,
        m.first_name || ' ' || m.last_name as manager_name,
        m.email as manager_email
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

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
          department: user.department,
          jobTitle: user.job_title,
          phone: user.phone,
          approvalThresholdPercent: parseFloat(user.approval_threshold_percent) || null,
          canApproveQuotes: user.can_approve_quotes,
          maxApprovalAmountCents: user.max_approval_amount_cents,
          managerId: user.manager_id,
          managerName: user.manager_name,
          managerEmail: user.manager_email,
          createdAt: user.created_at,
          lastLogin: user.last_login
        }
      }
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

/**
 * @route   GET /api/users/approvers
 * @desc    Get list of users who can approve quotes
 * @access  Private
 */
router.get('/approvers', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        email,
        first_name,
        last_name,
        role,
        department
      FROM users
      WHERE can_approve_quotes = true
        AND is_active = true
      ORDER BY first_name, last_name
    `);

    res.json({
      success: true,
      data: {
        approvers: result.rows.map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role,
          department: user.department
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching approvers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approvers'
    });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get single user details
 * @access  Private (admin, manager, or own profile)
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Users can view their own profile, admins/managers can view any
    const isOwnProfile = req.user.id === userId;
    const isAdminOrManager = ['admin', 'manager'].includes(req.user.role?.toLowerCase());

    if (!isOwnProfile && !isAdminOrManager) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.is_active,
        u.department,
        u.job_title,
        u.phone,
        u.approval_threshold_percent,
        u.can_approve_quotes,
        u.max_approval_amount_cents,
        u.manager_id,
        u.created_at,
        u.last_login,
        m.first_name || ' ' || m.last_name as manager_name,
        m.email as manager_email
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

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
          department: user.department,
          jobTitle: user.job_title,
          phone: user.phone,
          approvalThresholdPercent: parseFloat(user.approval_threshold_percent) || null,
          canApproveQuotes: user.can_approve_quotes,
          maxApprovalAmountCents: user.max_approval_amount_cents,
          managerId: user.manager_id,
          managerName: user.manager_name,
          managerEmail: user.manager_email,
          createdAt: user.created_at,
          lastLogin: user.last_login
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user details
 * @access  Private (admin only, or own profile for limited fields)
 */
router.put('/:id', authenticate, async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const userId = parseInt(req.params.id);
    const isOwnProfile = req.user.id === userId;
    const isAdmin = req.user.role?.toLowerCase() === 'admin';

    if (!isOwnProfile && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const {
      firstName,
      lastName,
      email,
      role,
      isActive,
      department,
      jobTitle,
      phone,
      approvalThresholdPercent,
      canApproveQuotes,
      maxApprovalAmountCents,
      managerId
    } = req.body;

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Fields anyone can update on their own profile
    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex}`);
      values.push(firstName);
      paramIndex++;
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex}`);
      values.push(lastName);
      paramIndex++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }

    // Admin-only fields
    if (isAdmin) {
      if (email !== undefined) {
        // Check if email is already in use
        const emailCheck = await client.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, userId]
        );
        if (emailCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: 'Email already in use'
          });
        }
        updates.push(`email = $${paramIndex}`);
        values.push(email);
        paramIndex++;
      }
      if (role !== undefined) {
        updates.push(`role = $${paramIndex}`);
        values.push(role);
        paramIndex++;
      }
      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(isActive);
        paramIndex++;
      }
      if (department !== undefined) {
        updates.push(`department = $${paramIndex}`);
        values.push(department);
        paramIndex++;
      }
      if (jobTitle !== undefined) {
        updates.push(`job_title = $${paramIndex}`);
        values.push(jobTitle);
        paramIndex++;
      }
      if (approvalThresholdPercent !== undefined) {
        updates.push(`approval_threshold_percent = $${paramIndex}`);
        values.push(approvalThresholdPercent);
        paramIndex++;
      }
      if (canApproveQuotes !== undefined) {
        updates.push(`can_approve_quotes = $${paramIndex}`);
        values.push(canApproveQuotes);
        paramIndex++;
      }
      if (maxApprovalAmountCents !== undefined) {
        updates.push(`max_approval_amount_cents = $${paramIndex}`);
        values.push(maxApprovalAmountCents);
        paramIndex++;
      }
      if (managerId !== undefined) {
        // Prevent circular reference
        if (managerId === userId) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'User cannot be their own manager'
          });
        }
        updates.push(`manager_id = $${paramIndex}`);
        values.push(managerId || null);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log the update in audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, details, created_at)
      VALUES ($1, 'user_updated', 'user', $2, $3, $4, CURRENT_TIMESTAMP)
    `, [req.user.id, userId, req.ip, JSON.stringify(req.body)]);

    await client.query('COMMIT');

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          department: user.department,
          jobTitle: user.job_title,
          phone: user.phone,
          approvalThresholdPercent: parseFloat(user.approval_threshold_percent) || null,
          canApproveQuotes: user.can_approve_quotes,
          maxApprovalAmountCents: user.max_approval_amount_cents,
          managerId: user.manager_id
        }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  } finally {
    client.release();
  }
});

/**
 * @route   PUT /api/users/:id/approval-settings
 * @desc    Update user's approval settings specifically
 * @access  Private (admin only)
 */
router.put('/:id/approval-settings', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const {
      approvalThresholdPercent,
      canApproveQuotes,
      maxApprovalAmountCents,
      managerId
    } = req.body;

    const result = await db.query(`
      UPDATE users
      SET
        approval_threshold_percent = $1,
        can_approve_quotes = $2,
        max_approval_amount_cents = $3,
        manager_id = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, email, first_name, last_name, role, approval_threshold_percent, can_approve_quotes, max_approval_amount_cents, manager_id
    `, [
      approvalThresholdPercent,
      canApproveQuotes,
      maxApprovalAmountCents,
      managerId || null,
      userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'Approval settings updated successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          approvalThresholdPercent: parseFloat(user.approval_threshold_percent) || null,
          canApproveQuotes: user.can_approve_quotes,
          maxApprovalAmountCents: user.max_approval_amount_cents,
          managerId: user.manager_id
        }
      }
    });
  } catch (error) {
    console.error('Error updating approval settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update approval settings'
    });
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Deactivate a user (soft delete)
 * @access  Private (admin only)
 */
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent admin from deactivating themselves
    if (req.user.id === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const result = await db.query(`
      UPDATE users
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user'
    });
  }
});

/**
 * @route   POST /api/users/:id/reactivate
 * @desc    Reactivate a deactivated user
 * @access  Private (admin only)
 */
router.post('/:id/reactivate', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await db.query(`
      UPDATE users
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User reactivated successfully'
    });
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate user'
    });
  }
});

module.exports = router;
