/**
 * TeleTime POS - Trade-In Components Index
 * Export all trade-in related components
 */

// Main Modal (orchestrates all steps)
export { TradeInModal } from './TradeInModal';

// Step Components
export { TradeInProductSearch } from './TradeInProductSearch';
export { ConditionSelector } from './ConditionSelector';
export { TradeInDetails } from './TradeInDetails';
export { TradeInConfirmation } from './TradeInConfirmation';

// Button and Cart Components
export {
  TradeInButton,
  TradeInSummary,
  TradeInLineItem,
} from './TradeInButton';

// Cart Integration
export {
  TradeInCartSection,
  TradeInTotalsRow,
  TradeInReceiptSection,
} from './TradeInCartSection';
