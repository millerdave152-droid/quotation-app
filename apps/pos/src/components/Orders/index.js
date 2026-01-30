/**
 * TeleTime POS - Order Components
 * Centralized exports for order/transaction components
 */

export { TransactionDetails } from './TransactionDetails';
export { CustomerWarranties } from './CustomerWarranties';

// Default export as namespace
import { TransactionDetails } from './TransactionDetails';
import { CustomerWarranties } from './CustomerWarranties';

export default {
  TransactionDetails,
  CustomerWarranties,
};
