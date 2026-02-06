/**
 * TeleTime POS - Order Components
 * Centralized exports for order/transaction components
 */

export { TransactionDetails } from './TransactionDetails';
export { CustomerWarranties } from './CustomerWarranties';
export { default as TransactionList } from './TransactionList';
export {
  default as TransactionFilterTabs,
  TransactionFilterTabsCompact,
} from './TransactionFilterTabs';

// Default export as namespace
import { TransactionDetails } from './TransactionDetails';
import { CustomerWarranties } from './CustomerWarranties';
import TransactionList from './TransactionList';
import TransactionFilterTabs, { TransactionFilterTabsCompact } from './TransactionFilterTabs';

export default {
  TransactionDetails,
  CustomerWarranties,
  TransactionList,
  TransactionFilterTabs,
  TransactionFilterTabsCompact,
};
