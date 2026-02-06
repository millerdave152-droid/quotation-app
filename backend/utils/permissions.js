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

/**
 * Fallback permission sets when neither roles nor pos_roles tables are migrated.
 * Keyed by the existing `role` column value.
 */
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
 * Resolve permissions for a user.
 * Priority: normalized permissions (from roles table) > POS JSONB permissions > fallback
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

  // 3. Fallback based on role column
  const role = (user.role || 'user').toLowerCase();
  return FALLBACK_ROLE_PERMISSIONS[role] || FALLBACK_ROLE_PERMISSIONS.user;
}

/**
 * Check if a user has a specific permission
 * @param {object} user - User object
 * @param {string} permission - Permission code string (e.g., 'hub.orders.edit')
 * @returns {boolean}
 */
function hasPermission(user, permission) {
  // Admin role always has all permissions
  if (user.role === 'admin' || user.roleName === 'admin') {
    return true;
  }
  const perms = resolvePermissions(user);
  return perms.includes(permission);
}

module.exports = {
  POS_PERMISSIONS,
  FALLBACK_ROLE_PERMISSIONS,
  resolvePermissions,
  hasPermission,
};
