/**
 * TeleTime POS - Upsell Offer Modal
 * Container component for displaying upsell offers in checkout flow
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCartContext } from '../../context/CartContext';
import { useUpsellOffers } from '../../hooks/useUpsellOffers';
import UpgradeOfferCard from './UpgradeOfferCard';
import ServiceOfferCard from './ServiceOfferCard';
import MembershipPrompt from './MembershipPrompt';
import FinancingPrompt from './FinancingPrompt';
import { formatCurrency } from '../../utils/formatters';

/**
 * Upsell offer modal component
 * @param {object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - Close modal callback
 * @param {function} props.onComplete - Complete (proceed to payment) callback
 * @param {function} props.onAddItem - Add item to cart callback
 * @param {function} props.onAddService - Add service callback
 * @param {function} props.onJoinMembership - Join membership callback
 * @param {function} props.onSelectFinancing - Select financing callback
 * @param {string} props.mode - 'sequential' | 'tabs' | 'all'
 * @param {string} props.className - Additional CSS classes
 */
export function UpsellOfferModal({
  isOpen,
  onClose,
  onComplete,
  onAddItem,
  onAddService,
  onJoinMembership,
  onSelectFinancing,
  mode = 'sequential',
  className = '',
}) {
  const { items, customer, total, addItem } = useCartContext();
  const modalRef = useRef(null);

  // Active tab (for tabs mode)
  const [activeTab, setActiveTab] = useState('offers');

  // Step tracking (for sequential mode)
  const [currentStep, setCurrentStep] = useState('offers'); // 'offers', 'services', 'membership', 'financing'

  // Added items tracking
  const [addedItems, setAddedItems] = useState([]);
  const [addedServices, setAddedServices] = useState([]);

  const {
    offers,
    currentOffer,
    currentOfferIndex,
    services,
    membershipOffers,
    financingOptions,
    hasOffers,
    hasServices,
    hasMembershipOffers,
    hasFinancingOptions,
    shouldShowFinancing,
    loading,
    acceptOffer,
    declineOffer,
    skipOffer,
    acceptService,
    declineService,
    acceptMembership,
    declineMembership,
    selectFinancing,
    startOfferTiming,
    moveToNextOffer,
    resetSession,
  } = useUpsellOffers({
    cart: { items, total, subtotal: total },
    customer,
    enabled: isOpen,
    location: 'checkout',
    maxOffers: 3,
  });

  // Start timing when offer is shown
  useEffect(() => {
    if (isOpen && currentOffer) {
      startOfferTiming(currentOffer.offerId);
    }
  }, [isOpen, currentOffer, startOfferTiming]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleSkipAll();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Handle accept upgrade offer
  const handleAcceptUpgrade = useCallback(
    async (offer) => {
      await acceptOffer(offer, {
        revenueAddedCents: offer.priceDifferenceCents,
      });

      // Add the upgrade item and remove the original
      if (offer.suggestedItem && offer.currentItem) {
        // Remove current item
        const currentCartItem = items.find(
          (item) => item.productId === offer.currentItem.id
        );
        if (currentCartItem && onAddItem) {
          // Replace with upgrade
          onAddItem({
            ...offer.suggestedItem,
            productId: offer.suggestedItem.id,
            productName: offer.suggestedItem.name,
            unitPrice: offer.suggestedItem.price,
          }, { replaceId: currentCartItem.id });
        }
      }

      setAddedItems((prev) => [...prev, offer.offerId]);
      moveToNextStepIfNeeded();
    },
    [acceptOffer, items, onAddItem]
  );

  // Handle decline upgrade offer
  const handleDeclineUpgrade = useCallback(
    async (offer) => {
      await declineOffer(offer);
      moveToNextStepIfNeeded();
    },
    [declineOffer]
  );

  // Handle accept service
  const handleAcceptService = useCallback(
    async (service) => {
      await acceptService(service);

      if (onAddService) {
        onAddService(service);
      }

      setAddedServices((prev) => [...prev, service.serviceId]);
    },
    [acceptService, onAddService]
  );

  // Handle decline service
  const handleDeclineService = useCallback(
    (service) => {
      declineService(service);
    },
    [declineService]
  );

  // Handle join membership
  const handleJoinMembership = useCallback(
    async (membershipOffer) => {
      await acceptMembership(membershipOffer);

      if (onJoinMembership) {
        onJoinMembership(membershipOffer);
      }

      moveToNextStepIfNeeded();
    },
    [acceptMembership, onJoinMembership]
  );

  // Handle decline membership
  const handleDeclineMembership = useCallback(() => {
    declineMembership();
    moveToNextStepIfNeeded();
  }, [declineMembership]);

  // Handle select financing
  const handleSelectFinancing = useCallback(
    async (financing) => {
      if (financing) {
        await selectFinancing(financing);
      }

      if (onSelectFinancing) {
        onSelectFinancing(financing);
      }

      // Proceed to payment
      handleComplete();
    },
    [selectFinancing, onSelectFinancing]
  );

  // Handle skip all and proceed
  const handleSkipAll = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Handle complete
  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // Move to next step in sequential mode
  const moveToNextStepIfNeeded = useCallback(() => {
    if (mode !== 'sequential') return;

    const steps = ['offers', 'services', 'membership', 'financing'];
    const currentIndex = steps.indexOf(currentStep);

    // Find next step with content
    for (let i = currentIndex + 1; i < steps.length; i++) {
      const step = steps[i];
      if (step === 'offers' && hasOffers) {
        setCurrentStep('offers');
        return;
      }
      if (step === 'services' && hasServices) {
        setCurrentStep('services');
        return;
      }
      if (step === 'membership' && hasMembershipOffers) {
        setCurrentStep('membership');
        return;
      }
      if (step === 'financing' && hasFinancingOptions && shouldShowFinancing) {
        setCurrentStep('financing');
        return;
      }
    }

    // All steps complete, proceed
    handleComplete();
  }, [mode, currentStep, hasOffers, hasServices, hasMembershipOffers, hasFinancingOptions, shouldShowFinancing, handleComplete]);

  // Check if there's anything to show
  const hasAnything = hasOffers || hasServices || hasMembershipOffers || (hasFinancingOptions && shouldShowFinancing);

  if (!isOpen) return null;

  // Loading state
  if (loading && !hasAnything) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600">Finding the best offers for you...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Nothing to show - proceed directly
  if (!hasAnything && !loading) {
    // Auto-proceed after a brief delay
    setTimeout(() => handleComplete(), 100);
    return null;
  }

  // Tabs mode
  if (mode === 'tabs') {
    const tabs = [
      { id: 'offers', label: 'Upgrades', count: offers.length, show: hasOffers },
      { id: 'services', label: 'Services', count: services.length, show: hasServices },
      { id: 'membership', label: 'Membership', count: membershipOffers.length, show: hasMembershipOffers },
      { id: 'financing', label: 'Financing', count: financingOptions.length, show: hasFinancingOptions && shouldShowFinancing },
    ].filter((t) => t.show);

    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleSkipAll} />

        <div
          ref={modalRef}
          className={`absolute inset-4 md:inset-8 lg:inset-12 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden ${className}`}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Special Offers</h2>
              <button
                onClick={handleSkipAll}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mt-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-white rounded-full text-xs">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'offers' && hasOffers && (
              <div className="space-y-4">
                {offers.map((offer) => (
                  <UpgradeOfferCard
                    key={offer.offerId}
                    offer={offer}
                    onAccept={handleAcceptUpgrade}
                    onDecline={handleDeclineUpgrade}
                  />
                ))}
              </div>
            )}

            {activeTab === 'services' && hasServices && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service) => (
                  <ServiceOfferCard
                    key={service.serviceId}
                    service={service}
                    variant="featured"
                    onAdd={handleAcceptService}
                    onDecline={handleDeclineService}
                  />
                ))}
              </div>
            )}

            {activeTab === 'membership' && hasMembershipOffers && (
              <div className="max-w-lg mx-auto">
                {membershipOffers[0] && (
                  <MembershipPrompt
                    offer={membershipOffers[0]}
                    cartValue={total}
                    onJoin={handleJoinMembership}
                    onDecline={handleDeclineMembership}
                  />
                )}
              </div>
            )}

            {activeTab === 'financing' && hasFinancingOptions && (
              <div className="max-w-2xl mx-auto">
                <FinancingPrompt
                  options={financingOptions}
                  cartTotal={total}
                  variant="comparison"
                  onSelect={handleSelectFinancing}
                  onDecline={handleComplete}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cart Total</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(total)}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSkipAll}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Skip All
                </button>
                <button
                  onClick={handleComplete}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
                >
                  Proceed to Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sequential mode (default) - show one offer type at a time
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-50 rounded-2xl shadow-2xl ${className}`}
        >
          {/* Progress indicator */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hasOffers && (
                  <div
                    className={`w-2 h-2 rounded-full ${
                      currentStep === 'offers' ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
                {hasServices && (
                  <div
                    className={`w-2 h-2 rounded-full ${
                      currentStep === 'services' ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
                {hasMembershipOffers && (
                  <div
                    className={`w-2 h-2 rounded-full ${
                      currentStep === 'membership' ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
                {hasFinancingOptions && shouldShowFinancing && (
                  <div
                    className={`w-2 h-2 rounded-full ${
                      currentStep === 'financing' ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
              <button
                onClick={handleSkipAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip all & checkout
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Upgrade offers */}
            {currentStep === 'offers' && hasOffers && currentOffer && (
              <UpgradeOfferCard
                offer={currentOffer}
                onAccept={handleAcceptUpgrade}
                onDecline={handleDeclineUpgrade}
              />
            )}

            {/* Service offers */}
            {currentStep === 'services' && hasServices && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Add Professional Services
                </h2>
                {services.slice(0, 3).map((service) => (
                  <ServiceOfferCard
                    key={service.serviceId}
                    service={service}
                    variant="standard"
                    onAdd={handleAcceptService}
                    onDecline={handleDeclineService}
                  />
                ))}
                <button
                  onClick={moveToNextStepIfNeeded}
                  className="w-full py-3 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Continue without services
                </button>
              </div>
            )}

            {/* Membership prompt */}
            {currentStep === 'membership' && hasMembershipOffers && membershipOffers[0] && (
              <MembershipPrompt
                offer={membershipOffers[0]}
                cartValue={total}
                onJoin={handleJoinMembership}
                onDecline={handleDeclineMembership}
              />
            )}

            {/* Financing prompt */}
            {currentStep === 'financing' && hasFinancingOptions && (
              <FinancingPrompt
                options={financingOptions}
                cartTotal={total}
                onSelect={handleSelectFinancing}
                onDecline={handleComplete}
              />
            )}
          </div>

          {/* Added items summary */}
          {(addedItems.length > 0 || addedServices.length > 0) && (
            <div className="sticky bottom-0 bg-green-50 border-t border-green-100 px-6 py-3">
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">
                  {addedItems.length + addedServices.length} item{addedItems.length + addedServices.length !== 1 ? 's' : ''} added to your order
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpsellOfferModal;
