/**
 * TeleTime POS - Upsell Components
 * Export all upsell offer components
 */

// Main modal container
export { UpsellOfferModal, default as UpsellOfferModalDefault } from './UpsellOfferModal';

// Individual offer cards
export { UpgradeOfferCard, default as UpgradeOfferCardDefault } from './UpgradeOfferCard';
export { ServiceOfferCard, default as ServiceOfferCardDefault } from './ServiceOfferCard';
export { MembershipPrompt, default as MembershipPromptDefault } from './MembershipPrompt';
export { FinancingPrompt, default as FinancingPromptDefault } from './FinancingPrompt';

// Hook for managing upsell offers
export { useUpsellOffers, default as useUpsellOffersDefault } from '../../hooks/useUpsellOffers';
