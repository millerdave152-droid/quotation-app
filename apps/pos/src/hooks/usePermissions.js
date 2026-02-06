/**
 * TeleTime POS - usePermissions Hook
 * Convenience hook for permission-based UI rendering
 */

import { useAuth } from '../context/AuthContext';

/**
 * POS Permission constants — mirrors backend utils/permissions.js
 */
export const POS_PERMISSIONS = {
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
 * Hook that exposes permission checking from AuthContext.
 * @returns {{ can: (...perms: string[]) => boolean, permissions: string[] }}
 */
export function usePermissions() {
  const { hasPermission, permissions } = useAuth();
  return {
    /** Check if user has ANY of the given permissions */
    can: hasPermission,
    /** Raw permissions array */
    permissions,
  };
}

export default usePermissions;
