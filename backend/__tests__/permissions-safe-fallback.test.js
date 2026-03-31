/**
 * Permissions Safe Fallback Tests
 *
 * Verifies CRIT-8 fix: when DB-backed permissions are unavailable,
 * resolvePermissions() returns fail-closed (empty/minimal) permissions
 * instead of granting elevated access.
 */

const {
  resolvePermissions,
  hasPermission,
  SAFE_FALLBACK_PERMISSIONS,
  POS_PERMISSIONS,
} = require('../utils/permissions');

// Suppress logger.warn output during tests
jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

describe('SAFE_FALLBACK_PERMISSIONS (CRIT-8 fix)', () => {
  describe('resolvePermissions() with no DB permissions loaded', () => {
    it('admin with no DB permissions gets EMPTY array (fail-closed)', () => {
      const user = {
        id: 1,
        role: 'admin',
        permissions: null,      // DB lookup failed — no normalized permissions
        posPermissions: null,   // No POS JSONB permissions either
      };

      const result = resolvePermissions(user);

      expect(result).toEqual([]);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE);
    });

    it('manager with no DB permissions gets EMPTY array (fail-closed)', () => {
      const user = {
        id: 2,
        role: 'manager',
        permissions: null,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      expect(result).toEqual([]);
    });

    it('cashier with no DB permissions gets minimal read-only', () => {
      const user = {
        id: 3,
        role: 'cashier',
        permissions: null,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      expect(result).toContain(POS_PERMISSIONS.DRAWER_OPEN);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_CREATE);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE);
      expect(result).not.toContain(POS_PERMISSIONS.RETURNS_PROCESS_REFUND);
    });

    it('sales with no DB permissions gets view-only', () => {
      const user = {
        id: 4,
        role: 'sales',
        permissions: null,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      expect(result).toContain(POS_PERMISSIONS.DRAWER_OPEN);
      expect(result).toContain(POS_PERMISSIONS.REPORTS_VIEW);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
      expect(result).not.toContain(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE);
    });

    it('unknown role with no DB permissions gets EMPTY array', () => {
      const user = {
        id: 5,
        role: 'intern',
        permissions: null,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      expect(result).toEqual([]);
    });

    it('null role with no DB permissions gets EMPTY array', () => {
      const user = {
        id: 6,
        role: null,
        permissions: null,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      // Falls through to 'user' fallback
      expect(result).toEqual(SAFE_FALLBACK_PERMISSIONS.user);
    });
  });

  describe('resolvePermissions() with DB permissions loaded (normal path)', () => {
    it('returns DB permissions when available (no fallback needed)', () => {
      const dbPermissions = ['pos.checkout.create', 'pos.checkout.void', 'hub.orders.edit'];
      const user = {
        id: 1,
        role: 'admin',
        permissions: dbPermissions,
        posPermissions: null,
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(dbPermissions);
    });

    it('returns POS JSONB permissions when normalized not available', () => {
      const posPerms = ['pos.checkout.create', 'pos.drawer.open'];
      const user = {
        id: 2,
        role: 'cashier',
        permissions: null,
        posPermissions: posPerms,
      };

      const result = resolvePermissions(user);

      expect(result).toEqual(posPerms);
    });
  });

  describe('hasPermission() respects fail-closed for admin', () => {
    it('admin with no DB permissions is denied all permissions', () => {
      const user = {
        id: 1,
        role: 'admin',
        permissions: null,
        posPermissions: null,
      };

      expect(hasPermission(user, POS_PERMISSIONS.CHECKOUT_VOID)).toBe(false);
      expect(hasPermission(user, POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE)).toBe(false);
      expect(hasPermission(user, POS_PERMISSIONS.CHECKOUT_CREATE)).toBe(false);
    });

    it('admin with DB permissions loaded gets admin bypass', () => {
      const user = {
        id: 1,
        role: 'admin',
        permissions: ['pos.checkout.create'],  // At least one DB-backed permission
        posPermissions: null,
      };

      // Admin bypass only when DB permissions are loaded (non-empty)
      expect(hasPermission(user, POS_PERMISSIONS.CHECKOUT_VOID)).toBe(true);
      expect(hasPermission(user, 'any.permission.at.all')).toBe(true);
    });
  });

  describe('SAFE_FALLBACK_PERMISSIONS structure', () => {
    it('admin fallback is empty', () => {
      expect(SAFE_FALLBACK_PERMISSIONS.admin).toEqual([]);
    });

    it('manager fallback is empty', () => {
      expect(SAFE_FALLBACK_PERMISSIONS.manager).toEqual([]);
    });

    it('cashier fallback does not include checkout or void', () => {
      expect(SAFE_FALLBACK_PERMISSIONS.cashier).not.toContain(POS_PERMISSIONS.CHECKOUT_CREATE);
      expect(SAFE_FALLBACK_PERMISSIONS.cashier).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
    });

    it('no fallback role has price override permission', () => {
      for (const [role, perms] of Object.entries(SAFE_FALLBACK_PERMISSIONS)) {
        expect(perms).not.toContain(POS_PERMISSIONS.CHECKOUT_PRICE_OVERRIDE);
      }
    });

    it('no fallback role has void permission', () => {
      for (const [role, perms] of Object.entries(SAFE_FALLBACK_PERMISSIONS)) {
        expect(perms).not.toContain(POS_PERMISSIONS.CHECKOUT_VOID);
      }
    });
  });
});
