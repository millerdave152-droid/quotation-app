/**
 * TeleTime POS - Customer Components
 * Centralized exports for customer lookup and management components
 */

export { CustomerLookup } from './CustomerLookup';
export { CustomerQuotesPanel } from './CustomerQuotesPanel';
export { QuickAddCustomer } from './QuickAddCustomer';
export { MarketingAttributionSelector } from './MarketingAttributionSelector';
export { CommunicationPreferences } from './CommunicationPreferences';

// Default export as namespace
import { CustomerLookup } from './CustomerLookup';
import { CustomerQuotesPanel } from './CustomerQuotesPanel';
import { QuickAddCustomer } from './QuickAddCustomer';
import { MarketingAttributionSelector } from './MarketingAttributionSelector';
import { CommunicationPreferences } from './CommunicationPreferences';

export default {
  CustomerLookup,
  CustomerQuotesPanel,
  QuickAddCustomer,
  MarketingAttributionSelector,
  CommunicationPreferences,
};
