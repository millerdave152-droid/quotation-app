/**
 * TeleTime - Permissions Utility Unit Tests
 *
 * Tests for the permissions utility that provides role-based access control,
 * permission resolution (normalized RBAC > legacy POS JSONB > fallback),
 * and permission checking.
 */

const {
  POS_PERMISSIONS,
  FALLBACK_ROLE_PERMISSIONS,
  resolvePermissions,
  hasPermission,
} = require('../utils/permissions');

// ============================================================================
// POS_PERMISSIONS CONSTANT
// ============================================================================

describe('POS_PERMISSIONS', () => {
  it('should export all 11 POS permission codes', () => {
    expect(Object.keys(POS_PERMISSIONS)).toHaveLength(11);
  });

  it('should have correct permission code for each key', () => {
    expect(POS_PERMISSIONS.CHECKOUT_CREATE).toBe('pos.checkout.create');
    expect(POS_PERMISSIONS.CHECKOUT_DISCOUNT).toBe('pos.checkout.discount');
    expect(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE).toBe('pos.checkout.price_override');
    expect(POS_PERMISSIONS.CHECKOUT_VOID).toBe('pos.checkout.void');
    expect(POS_PERMISSIONS.RETURNS_CREATE).toBe('pos.returns.create');
    expect(POS_PERMISSIONS.RETURNS_PROCESS_REFUND).toBe('pos.returns.process_refund');
    expect(POS_PERMISSIONS.DRAWER_OPEN).toBe('pos.drawer.open');
    expect(POS_PERMISSIONS.DRAWER_CLOSE_SHIFT).toBe('pos.drawer.close_shift');
    expect(POS_PERMISSIONS.REPORTS_VIEW).toBe('pos.reports.view');
    expect(POS_PERMISSIONS.CUSTOMERS_CREATE).toBe('pos.customers.create');
    expect(POS_PERMISSIONS.CUSTOMERS_EDIT).toBe('pos.customers.edit');
  });

  it('should use the pos.* namespace for all permissions', () => {
    Object.values(POS_PERMISSIONS).forEach((code) => {
      expect(code).toMatch(/^pos\./);
    });
  });
});

// ============================================================================
// FALLBACK_ROLE_PERMISSIONS CONSTANT
// ============================================================================

describe('FALLBACK_ROLE_PERMISSIONS', () => {
  it('should define fallback permissions for admin, manager, and user roles', () => {
    expect(FALLBACK_ROLE_PERMISSIONS).toHaveProperty('admin');
    expect(FALLBACK_ROLE_PERMISSIONS).toHaveProperty('manager');
    expect(FALLBACK_ROLE_PERMISSIONS).toHaveProperty('user');
  });

  it('should grant admin all POS permissions', () => {
    const allPerms = Object.values(POS_PERMISSIONS);
    expect(FALLBACK_ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(allPerms));
    expect(FALLBACK_ROLE_PERMISSIONS.admin).toHaveLength(allPerms.length);
  });

  it('should grant manager all POS permissions', () => {
    const allPerms = Object.values(POS_PERMISSIONS);
    expect(FALLBACK_ROLE_PERMISSIONS.manager).toEqual(expect.arrayContaining(allPerms));
    expect(FALLBACK_ROLE_PERMISSIONS.manager).toHaveLength(allPerms.length);
  });

  it('should grant user a limited set of permissions', () => {
    const userPerms = FALLBACK_ROLE_PERMISSIONS.user;
    expect(userPerms).toContain(POS_PERMISSIONS.CHECKOUT_CREATE);
    expect(userPerms).toContain(POS_PERMISSIONS.DRAWER_OPEN);
    expect(userPerms).toContain(POS_PERMISSIONS.CUSTOMERS_CREATE);
    expect(userPerms).toContain(POS_PERMISSIONS.REPORTS_VIEW);
    expect(userPerms).toHaveLength(4);
  });

  it('should NOT grant user sensitive permissions', () => {
    const userPerms = FALLBACK_ROLE_PERMISSIONS.user;
    expect(userPerms).not.toContain(POS_PERMISSIONS.CHECKOUT_DISCOUNT);
    expect(userPerms).not.toContain(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE);
    expect(userPerms).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
    expect(userPerms).not.toContain(POS_PERMISSIONS.RETURNS_CREATE);
    expect(userPerms).not.toContain(POS_PERMISSIONS.RETURNS_PROCESS_REFUND);
    expect(userPerms).not.toContain(POS_PERMISSIONS.DRAWER_CLOSE_SHIFT);
    expect(userPerms).not.toContain(POS_PERMISSIONS.CUSTOMERS_EDIT);
  });
});

// ============================================================================
// resolvePermissions()
// ============================================================================

describe('resolvePermissions', () => {
  // --------------------------------------------------------------------------
  // Priority 1: Normalized RBAC permissions
  // --------------------------------------------------------------------------

  describe('Priority 1: Normalized RBAC permissions (user.permissions)', () => {
    it('should return normalized permissions when present', () => {
      const user = {
        role: 'user',
        permissions: ['hub.orders.view', 'hub.orders.edit'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['hub.orders.view', 'hub.orders.edit']);
    });

    it('should prefer normalized permissions over posPermissions', () => {
      const user = {
        role: 'user',
        permissions: ['hub.orders.view'],
        posPermissions: ['pos.checkout.create', 'pos.drawer.open'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['hub.orders.view']);
    });

    it('should prefer normalized permissions over fallback role', () => {
      const user = {
        role: 'admin',
        permissions: ['hub.orders.view'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['hub.orders.view']);
    });

    it('should handle a single normalized permission', () => {
      const user = {
        permissions: ['pos.checkout.create'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['pos.checkout.create']);
    });
  });

  // --------------------------------------------------------------------------
  // Priority 2: Legacy POS JSONB permissions
  // --------------------------------------------------------------------------

  describe('Priority 2: Legacy POS JSONB permissions (user.posPermissions)', () => {
    it('should use posPermissions when no normalized permissions exist', () => {
      const user = {
        role: 'user',
        posPermissions: ['pos.checkout.create', 'pos.drawer.open'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['pos.checkout.create', 'pos.drawer.open']);
    });

    it('should use posPermissions when permissions array is empty', () => {
      const user = {
        role: 'user',
        permissions: [],
        posPermissions: ['pos.checkout.create'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['pos.checkout.create']);
    });

    it('should use posPermissions when permissions is not an array', () => {
      const user = {
        role: 'user',
        permissions: 'not-an-array',
        posPermissions: ['pos.drawer.open'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['pos.drawer.open']);
    });

    it('should use posPermissions when permissions is null', () => {
      const user = {
        role: 'user',
        permissions: null,
        posPermissions: ['pos.reports.view'],
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(['pos.reports.view']);
    });

    it('should return empty array if posPermissions is an empty array', () => {
      const user = {
        role: 'unknown_role',
        permissions: [],
        posPermissions: [],
      };

      // posPermissions is an array (even empty), so it is returned
      const result = resolvePermissions(user);

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Priority 3: Fallback based on role column
  // --------------------------------------------------------------------------

  describe('Priority 3: Fallback based on role column', () => {
    it('should fall back to admin permissions for admin role', () => {
      const user = { role: 'admin' };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.admin);
    });

    it('should fall back to manager permissions for manager role', () => {
      const user = { role: 'manager' };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.manager);
    });

    it('should fall back to user permissions for user role', () => {
      const user = { role: 'user' };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });

    it('should be case-insensitive for role matching', () => {
      expect(resolvePermissions({ role: 'ADMIN' })).toEqual(FALLBACK_ROLE_PERMISSIONS.admin);
      expect(resolvePermissions({ role: 'Admin' })).toEqual(FALLBACK_ROLE_PERMISSIONS.admin);
      expect(resolvePermissions({ role: 'MANAGER' })).toEqual(FALLBACK_ROLE_PERMISSIONS.manager);
      expect(resolvePermissions({ role: 'Manager' })).toEqual(FALLBACK_ROLE_PERMISSIONS.manager);
      expect(resolvePermissions({ role: 'USER' })).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });

    it('should default to user permissions for unknown roles', () => {
      const user = { role: 'intern' };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });

    it('should default to user permissions when role is undefined', () => {
      const user = {};

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });

    it('should default to user permissions when role is null', () => {
      const user = { role: null };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });

    it('should default to user permissions when role is empty string', () => {
      const user = { role: '' };

      const result = resolvePermissions(user);

      expect(result).toEqual(FALLBACK_ROLE_PERMISSIONS.user);
    });
  });
});

// ============================================================================
// hasPermission()
// ============================================================================

describe('hasPermission', () => {
  // --------------------------------------------------------------------------
  // Admin bypass
  // --------------------------------------------------------------------------

  describe('Admin bypass', () => {
    it('should return true for admin role regardless of permission', () => {
      const user = { role: 'admin' };

      expect(hasPermission(user, 'pos.checkout.void')).toBe(true);
      expect(hasPermission(user, 'hub.orders.edit')).toBe(true);
      expect(hasPermission(user, 'anything.at.all')).toBe(true);
    });

    it('should return true for admin roleName regardless of permission', () => {
      const user = { role: 'user', roleName: 'admin' };

      expect(hasPermission(user, 'pos.checkout.void')).toBe(true);
      expect(hasPermission(user, 'hub.orders.edit')).toBe(true);
    });

    it('should bypass even when permissions array is empty', () => {
      const user = { role: 'admin', permissions: [] };

      expect(hasPermission(user, 'pos.checkout.void')).toBe(true);
    });

    it('should bypass even when user has no permissions field', () => {
      const user = { role: 'admin' };

      expect(hasPermission(user, 'pos.returns.process_refund')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Permission checking via resolvePermissions
  // --------------------------------------------------------------------------

  describe('Permission checking with normalized RBAC permissions', () => {
    it('should return true when user has the exact permission', () => {
      const user = {
        role: 'user',
        permissions: ['hub.orders.view', 'hub.orders.edit'],
      };

      expect(hasPermission(user, 'hub.orders.view')).toBe(true);
      expect(hasPermission(user, 'hub.orders.edit')).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      const user = {
        role: 'user',
        permissions: ['hub.orders.view'],
      };

      expect(hasPermission(user, 'hub.orders.edit')).toBe(false);
      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
    });
  });

  describe('Permission checking with legacy POS permissions', () => {
    it('should return true when user has the permission via posPermissions', () => {
      const user = {
        role: 'user',
        posPermissions: ['pos.checkout.create', 'pos.drawer.open'],
      };

      expect(hasPermission(user, 'pos.checkout.create')).toBe(true);
      expect(hasPermission(user, 'pos.drawer.open')).toBe(true);
    });

    it('should return false when user lacks the permission via posPermissions', () => {
      const user = {
        role: 'user',
        posPermissions: ['pos.checkout.create'],
      };

      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
    });
  });

  describe('Permission checking with fallback role permissions', () => {
    it('should check against fallback permissions for manager role', () => {
      const user = { role: 'manager' };

      // Manager gets all POS permissions via fallback
      expect(hasPermission(user, 'pos.checkout.void')).toBe(true);
      expect(hasPermission(user, 'pos.returns.process_refund')).toBe(true);
      expect(hasPermission(user, 'pos.drawer.close_shift')).toBe(true);
    });

    it('should check against fallback permissions for user role', () => {
      const user = { role: 'user' };

      // User gets limited permissions via fallback
      expect(hasPermission(user, 'pos.checkout.create')).toBe(true);
      expect(hasPermission(user, 'pos.drawer.open')).toBe(true);
      expect(hasPermission(user, 'pos.customers.create')).toBe(true);
      expect(hasPermission(user, 'pos.reports.view')).toBe(true);

      // User should NOT have sensitive permissions
      expect(hasPermission(user, 'pos.checkout.discount')).toBe(false);
      expect(hasPermission(user, 'pos.checkout.price_override')).toBe(false);
      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
      expect(hasPermission(user, 'pos.returns.create')).toBe(false);
      expect(hasPermission(user, 'pos.returns.process_refund')).toBe(false);
      expect(hasPermission(user, 'pos.drawer.close_shift')).toBe(false);
      expect(hasPermission(user, 'pos.customers.edit')).toBe(false);
    });

    it('should use user fallback for unknown roles', () => {
      const user = { role: 'cashier' };

      expect(hasPermission(user, 'pos.checkout.create')).toBe(true);
      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle user with no role and no permissions', () => {
      const user = {};

      // Falls back to "user" role permissions
      expect(hasPermission(user, 'pos.checkout.create')).toBe(true);
      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
    });

    it('should not treat non-admin roleName as admin', () => {
      const user = { role: 'user', roleName: 'manager' };

      // roleName is "manager" not "admin", so no admin bypass;
      // resolvePermissions falls back to "user" role
      expect(hasPermission(user, 'pos.checkout.void')).toBe(false);
    });

    it('should handle permission check for a non-POS permission against fallback', () => {
      const user = { role: 'user' };

      expect(hasPermission(user, 'hub.orders.edit')).toBe(false);
    });

    it('should be exact-match only (no wildcard or prefix matching)', () => {
      const user = {
        role: 'user',
        permissions: ['pos.checkout'],
      };

      // "pos.checkout" does not match "pos.checkout.create"
      expect(hasPermission(user, 'pos.checkout.create')).toBe(false);
    });

    it('should not do admin bypass based on case-insensitive role check', () => {
      // The admin bypass in hasPermission checks user.role === 'admin' (strict equality)
      const user = { role: 'Admin' };

      // Strict equality fails for "Admin" !== "admin"
      // Falls through to resolvePermissions which lowercases and gets admin fallback
      // So has the POS permissions but bypass did NOT happen
      const perms = resolvePermissions(user);
      expect(perms).toEqual(FALLBACK_ROLE_PERMISSIONS.admin);
      // hasPermission should still work because fallback includes all POS perms
      expect(hasPermission(user, 'pos.checkout.void')).toBe(true);

      // But for a non-POS permission that is NOT in the fallback, it returns false
      expect(hasPermission(user, 'hub.orders.edit')).toBe(false);
    });

    it('should return true for admin role with non-POS permissions', () => {
      // Strict admin bypass works for role === 'admin' (lowercase)
      const user = { role: 'admin' };

      expect(hasPermission(user, 'hub.orders.edit')).toBe(true);
      expect(hasPermission(user, 'some.completely.unknown.permission')).toBe(true);
    });
  });
});
