/**
 * TeleTime - RBAC Management Routes
 * CRUD for roles, permissions, user role assignment, and self-service permissions.
 *
 * Exports multiple routers:
 *   rolesRouter       → /api/roles
 *   permissionsRouter → /api/permissions
 *   usersRbacRouter   → /api/users
 *   rbacRouter        → /api/rbac  (legacy mount point, delegates to above)
 */

const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { checkPermission, getUserPermissions, invalidateUserPermissionCache } = require('../middleware/checkPermission');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;

// ============================================================================
// ROLES ROUTER — /api/roles
// ============================================================================

const rolesRouter = express.Router();
rolesRouter.use(authenticate);

/**
 * GET /api/roles
 * List all roles with permission and user counts.
 * Permission: admin.roles
 */
rolesRouter.get('/', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT r.*,
            (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) AS permission_count,
            (SELECT COUNT(*) FROM users WHERE role_id = r.id) AS user_count
     FROM roles r
     ORDER BY r.name`
  );

  res.json({
    success: true,
    data: result.rows.map(r => ({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      isSystemRole: r.is_system_role,
      permissionCount: parseInt(r.permission_count),
      userCount: parseInt(r.user_count),
      createdAt: r.created_at,
    })),
  });
}));

/**
 * GET /api/roles/:id
 * Get role details with full permission list.
 * Permission: admin.roles
 */
rolesRouter.get('/:id', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid role ID');

  const roleResult = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
  if (roleResult.rows.length === 0) throw ApiError.notFound('Role');

  const role = roleResult.rows[0];

  const permsResult = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.category
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.category, p.code`,
    [id]
  );

  const usersResult = await pool.query(
    `SELECT id, email, first_name, last_name FROM users WHERE role_id = $1 ORDER BY first_name`,
    [id]
  );

  res.json({
    success: true,
    data: {
      id: role.id,
      name: role.name,
      displayName: role.display_name,
      description: role.description,
      isSystemRole: role.is_system_role,
      permissions: permsResult.rows.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
      })),
      users: usersResult.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      })),
    },
  });
}));

/**
 * POST /api/roles
 * Create a new role.
 * Permission: admin.roles
 */
rolesRouter.post('/', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().max(50).pattern(/^[a-z][a-z0-9_]*$/).required(),
    displayName: Joi.string().max(100).required(),
    description: Joi.string().max(500).optional().allow('', null),
    permissions: Joi.array().items(Joi.string().max(100)).optional(),
    permissionIds: Joi.array().items(Joi.number().integer()).optional(),
  });

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO roles (name, display_name, description, is_system_role)
       VALUES ($1, $2, $3, false) RETURNING *`,
      [value.name, value.displayName, value.description || null]
    );

    const role = result.rows[0];

    // Support both permission codes and IDs
    if (value.permissions && value.permissions.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2)
         ON CONFLICT DO NOTHING`,
        [role.id, value.permissions]
      );
    } else if (value.permissionIds && value.permissionIds.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM permissions p WHERE p.id = ANY($2::int[])
         ON CONFLICT DO NOTHING`,
        [role.id, value.permissionIds]
      );
    }

    await client.query('COMMIT');

    // Fetch assigned permission count
    const permCount = await pool.query(
      'SELECT COUNT(*) FROM role_permissions WHERE role_id = $1',
      [role.id]
    );

    res.status(201).json({
      success: true,
      data: {
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
        isSystemRole: false,
        permissionCount: parseInt(permCount.rows[0].count),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * PUT /api/roles/:id
 * Update a role's display name or description.
 * Permission: admin.roles
 */
rolesRouter.put('/:id', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid role ID');

  const schema = Joi.object({
    displayName: Joi.string().max(100).optional(),
    description: Joi.string().max(500).optional().allow('', null),
  }).min(1);

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const sets = [];
  const params = [];
  let idx = 1;

  if (value.displayName !== undefined) { sets.push(`display_name = $${idx}`); params.push(value.displayName); idx++; }
  if (value.description !== undefined) { sets.push(`description = $${idx}`); params.push(value.description); idx++; }
  sets.push('updated_at = NOW()');

  params.push(id);

  const result = await pool.query(
    `UPDATE roles SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (result.rows.length === 0) throw ApiError.notFound('Role');

  const role = result.rows[0];
  res.json({
    success: true,
    data: {
      id: role.id,
      name: role.name,
      displayName: role.display_name,
      description: role.description,
      isSystemRole: role.is_system_role,
    },
  });
}));

/**
 * DELETE /api/roles/:id
 * Delete a non-system role.
 * Permission: admin.roles
 */
rolesRouter.delete('/:id', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid role ID');

  const role = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
  if (role.rows.length === 0) throw ApiError.notFound('Role');
  if (role.rows[0].is_system_role) {
    throw ApiError.badRequest('Cannot delete a system role');
  }

  const userCount = await pool.query('SELECT COUNT(*) FROM users WHERE role_id = $1', [id]);
  if (parseInt(userCount.rows[0].count) > 0) {
    throw ApiError.badRequest('Cannot delete role with assigned users. Reassign them first.');
  }

  await pool.query('DELETE FROM roles WHERE id = $1', [id]);

  res.json({ success: true, message: 'Role deleted' });
}));

/**
 * PUT /api/roles/:id/permissions
 * Replace all permissions for a role.
 * Body: { permissions: ['code1', 'code2', ...] } or { permissionIds: [1, 2, ...] }
 * Permission: admin.roles
 */
rolesRouter.put('/:id/permissions', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid role ID');

  const schema = Joi.object({
    permissions: Joi.array().items(Joi.string().max(100)).optional(),
    permissionIds: Joi.array().items(Joi.number().integer()).optional(),
  }).or('permissions', 'permissionIds');

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const roleCheck = await pool.query('SELECT id FROM roles WHERE id = $1', [id]);
  if (roleCheck.rows.length === 0) throw ApiError.notFound('Role');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove existing permissions
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

    // Insert new permissions by code or by ID
    if (value.permissions && value.permissions.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2)
         ON CONFLICT DO NOTHING`,
        [id, value.permissions]
      );
    } else if (value.permissionIds && value.permissionIds.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM permissions p WHERE p.id = ANY($2::int[])
         ON CONFLICT DO NOTHING`,
        [id, value.permissionIds]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Invalidate permission cache for all users with this role
  const affectedUsers = await pool.query('SELECT id FROM users WHERE role_id = $1', [id]);
  for (const u of affectedUsers.rows) {
    invalidateUserPermissionCache(u.id);
  }

  // Return updated permissions
  const perms = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.category
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.category, p.code`,
    [id]
  );

  res.json({
    success: true,
    data: {
      roleId: id,
      permissions: perms.rows.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
      })),
    },
  });
}));

// ============================================================================
// PERMISSIONS ROUTER — /api/permissions
// ============================================================================

const permissionsRouter = express.Router();
permissionsRouter.use(authenticate);

/**
 * GET /api/permissions
 * List all permissions, optionally filtered by category.
 * Permission: admin.roles
 */
permissionsRouter.get('/', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const category = req.query.category || null;

  let query = 'SELECT * FROM permissions';
  const params = [];

  if (category) {
    query += ' WHERE category = $1';
    params.push(category);
  }

  query += ' ORDER BY category, code';

  const result = await pool.query(query, params);

  // Group by category
  const grouped = {};
  for (const p of result.rows) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
    });
  }

  res.json({
    success: true,
    data: result.rows.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.category,
    })),
    grouped,
  });
}));

/**
 * POST /api/permissions
 * Create a new permission.
 * Permission: admin.roles
 */
permissionsRouter.post('/', checkPermission('admin.roles'), asyncHandler(async (req, res) => {
  const schema = Joi.object({
    code: Joi.string().max(100).pattern(/^[a-z]+\.[a-z_]+\.[a-z_]+$/).required(),
    name: Joi.string().max(255).required(),
    description: Joi.string().max(500).optional().allow('', null),
    category: Joi.string().valid('pos', 'hub', 'reports', 'admin').required(),
  });

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await pool.query(
    `INSERT INTO permissions (code, name, description, category)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [value.code, value.name, value.description || null, value.category]
  );

  const p = result.rows[0];
  res.status(201).json({
    success: true,
    data: { id: p.id, code: p.code, name: p.name, description: p.description, category: p.category },
  });
}));

// ============================================================================
// USERS RBAC ROUTER — /api/users
// ============================================================================

const usersRbacRouter = express.Router();
usersRbacRouter.use(authenticate);

/**
 * GET /api/users/me/permissions
 * Get the current user's role and effective permissions.
 * No special permission required — every authenticated user can check their own.
 */
usersRbacRouter.get('/me/permissions', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  let permissions;
  try {
    permissions = await getUserPermissions(userId);
  } catch (err) {
    // Tables may not exist yet — fall back to req.user.permissions
    permissions = req.user.permissions || [];
  }

  // Group by category
  const grouped = {};
  for (const code of permissions) {
    const category = code.split('.')[0] || 'other';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(code);
  }

  res.json({
    success: true,
    data: {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.roleName || req.user.role,
      roleDisplayName: req.user.roleDisplayName || req.user.role,
      roleId: req.user.roleId || null,
      permissions,
      grouped,
    },
  });
}));

/**
 * PUT /api/users/:id/role
 * Assign a role to a user.
 * Permission: admin.users
 * Body: { roleId } or { role_id }
 */
usersRbacRouter.put('/:id/role', checkPermission('admin.users'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const schema = Joi.object({
    roleId: Joi.number().integer().optional(),
    role_id: Joi.number().integer().optional(),
  }).or('roleId', 'role_id');

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const roleId = value.roleId || value.role_id;

  // Verify role exists
  const role = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
  if (role.rows.length === 0) throw ApiError.notFound('Role');

  // Update user — sync legacy role column too
  const result = await pool.query(
    `UPDATE users SET role_id = $1, role = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, first_name, last_name, role, role_id`,
    [roleId, role.rows[0].name, userId]
  );

  if (result.rows.length === 0) throw ApiError.notFound('User');

  // Invalidate permission cache for this user
  invalidateUserPermissionCache(userId);

  const user = result.rows[0];
  res.json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      roleId: user.role_id,
      roleName: role.rows[0].name,
      roleDisplayName: role.rows[0].display_name,
    },
  });
}));

/**
 * GET /api/users/:id/permissions
 * Get effective permissions for any user (admin view).
 * Permission: admin.users
 */
usersRbacRouter.get('/:id/permissions', checkPermission('admin.users'), asyncHandler(async (req, res) => {
  // Avoid matching /me/permissions above — Express handles this via ordering
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) throw ApiError.badRequest('Invalid user ID');

  const userResult = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.role_id,
            r.name AS role_name, r.display_name AS role_display_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) throw ApiError.notFound('User');

  const user = userResult.rows[0];

  const perms = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.category
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.category, p.code`,
    [user.role_id]
  );

  const permList = perms.rows.map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    category: p.category,
  }));

  // Group by category
  const grouped = {};
  for (const p of permList) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }

  res.json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role,
      roleId: user.role_id,
      roleName: user.role_name,
      roleDisplayName: user.role_display_name,
      permissions: permList,
      grouped,
    },
  });
}));

// ============================================================================
// LEGACY RBAC ROUTER — /api/rbac (delegates to sub-routers)
// ============================================================================

const rbacRouter = express.Router();
rbacRouter.use(authenticate);

// Forward /api/rbac/roles/* → same handlers
rbacRouter.use('/roles', rolesRouter);
rbacRouter.use('/permissions', permissionsRouter);
rbacRouter.use('/users', usersRbacRouter);

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  return { rolesRouter, permissionsRouter, usersRbacRouter, rbacRouter };
};

module.exports = { init };
