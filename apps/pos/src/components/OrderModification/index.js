/**
 * TeleTime POS - Order Modification Components
 *
 * Components for managing order modifications:
 * - OrderModificationPanel: Main panel with tabs for Items, Amendments, History, Fulfillment
 * - Components for pending changes, amendments, and shipments
 */

export { default as OrderModificationPanel } from './OrderModificationPanel';

// Re-export hook for convenience
export { useOrderModification } from '../../hooks/useOrderModification';
