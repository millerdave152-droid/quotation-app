/**
 * Unified State Store
 * Shared state management for Quote Builder and POS
 *
 * Features:
 * - Customer state
 * - Cart/line items
 * - Discounts
 * - Pricing calculations
 * - Draft save/restore
 * - Offline support with sync
 */

// Core store and selectors
export { useUnifiedStore, useCustomer, useCart, usePricing, useDrafts, useSync } from './unifiedStore';

// Offline sync
export { useOfflineSync, getSyncManager, isOnline, waitForOnline } from './offlineSync';

// API client
export { draftApi, getDeviceId, generateDraftKey } from './draftApi';

// Convenience hooks
export {
  useUnifiedCart,
  useCustomerState,
  usePricingCalculations,
  useDraftManagement,
  useHeldTransactions,
} from './hooks';

// Provider and components
export {
  UnifiedStateProvider,
  useUnifiedStateContext,
  OnlineIndicator,
  SyncStatusBadge,
  SyncStatusPanel,
  OfflineBanner,
  DraftRecoveryModal,
} from './UnifiedStateProvider';

// Tax utilities
export { TAX_RATES, calculateTax, getEffectiveTaxRate, getTaxLabel, getProvinces } from './taxCalculations';

// IDB utilities (for advanced usage)
export { createIDBStorage, idbOperations } from './idbStorage';
