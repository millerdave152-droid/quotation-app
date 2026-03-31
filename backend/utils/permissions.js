/**
 * Permissions Utility
 * Defines all permissions and provides role-based resolution.
 * Supports both the legacy POS JSONB permissions and the normalized RBAC system.
 */

/**
 * All available POS permissions (legacy, kept for backward compatibility)
 */
const POS_PERMISSIONS = {
  CHECKOUT_CREATE: 'pos.checkout.create',
  CHECKOUT_DISCOUNT: 'pos.checkout.discount',
  CHECKOUT_PRICE_OVERRIDE: 'pos.checkout.price_override',
  CHECKOUT_VOID: 'pos.checkout.void',
  RETURNS_CREATE: 'pos.returns.create',
  RETURNS_PROCESS_REFUND: 'pos.returns.process_refund',
  DRAWER_OPEN: 'pos.drawer.open',
  DRAWER_CLOSE_SHIFT: 'pos.drawer.close_shift',
  REPORTS_VIEW: 'pos.reports.view',
  CUSTOMERS_CREATE: 'pos.customers.create',
  CUSTOMERS_EDIT: 'pos.customers.edit',
};

// DEPRECATED: replaced by SAFE_FALLBACK_PERMISSIONS (fail-closed)
// Kept for reference only — no longer returned by resolvePermissions().
const FALLBACK_ROLE_PERMISSIONS = {
  admin: Object.values(POS_PERMISSIONS),
  manager: Object.values(POS_PERMISSIONS),
  user: [
    POS_PERMISSIONS.CHECKOUT_CREATE,
    POS_PERMISSIONS.DRAWER_OPEN,
    POS_PERMISSIONS.CUSTOMERS_CREATE,
    POS_PERMISSIONS.REPORTS_VIEW,
  ],
};

/**
 * Safe fallback permissions when DB lookup fails.
 * SECURITY: Fail-closed — no role gets elevated permissions.
 * Admin and manager get EMPTY arrays (must re-authenticate to restore access).
 * Lower roles get minimal read-only permissions.
 */
const SAFE_FALLBACK_PERMISSIONS = {
  admin:   [],
  manager: [],
  sales:   [POS_PERMISSIONS.DRAWER_OPEN, POS_PERMISSIONS.REPORTS_VIEW, POS_PERMISSIONS.CUSTOMERS_CREATE],
  cashier: [POS_PERMISSIONS.DRAWER_OPEN],
  driver:  [],
  viewer:  [POS_PERMISSIONS.REPORTS_VIEW],
  user:    [POS_PERMISSIONS.DRAWER_OPEN, POS_PERMISSIONS.REPORTS_VIEW],
};

const logger = require('./logger');

/**
 * Resolve permissions for a user.
 * Priority: normalized permissions (from roles table) > POS JSONB permissions > safe fallback
 * @param {object} user - User object from req.user
 * @returns {string[]} Array of permission code strings
 */
function resolvePermissions(user) {
  // 1. Normalized RBAC permissions (from role_permissions table)
  if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }

  // 2. Legacy POS JSONB permissions (from pos_roles table)
  if (user.posPermissions && Array.isArray(user.posPermissions)) {
    return user.posPermissions;
  }

  // 3. Safe fallback — fail-closed: no elevated access during DB outage
  const role = (user.role || 'user').toLowerCase();
  logger.warn({ userId: user.id, role }, 'Permission DB lookup failed — using safe fallback');
  return SAFE_FALLBACK_PERMISSIONS[role] ?? [];
}

/**
 * Check if a user has a specific permission
 * @param {object} user - User object
 * @param {string} permission - Permission code string (e.g., 'hub.orders.edit')
 * @returns {boolean}
 */
function hasPermission(user, permission) {
  // Admin role always has all permissions — BUT only when DB-backed permissions were loaded
  // If we're in safe fallback (empty array), admin does NOT get bypass
  const perms = resolvePermissions(user);
  if (perms.length > 0 && (user.role === 'admin' || user.roleName === 'admin')) {
    return true;
  }
  return perms.includes(permission);
}

module.exports = {
  POS_PERMISSIONS,
  FALLBACK_ROLE_PERMISSIONS,
  SAFE_FALLBACK_PERMISSIONS,
  resolvePermissions,
  hasPermission,
};
