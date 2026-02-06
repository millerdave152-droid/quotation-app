/**
 * TeleTime POS - Warranty Upsell Component
 * Displays warranty options for eligible products during checkout
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  InformationCircleIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon as ShieldCheckSolid } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Warranty option card component
 */
function WarrantyOptionCard({
  warranty,
  isSelected,
  onSelect,
  onDecline,
  showDetails,
  onToggleDetails,
}) {
  return (
    <div
      className={`
        relative rounded-xl border-2 transition-all duration-200
        ${isSelected
          ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
          : 'border-gray-200 bg-white hover:border-blue-300'
        }
      `}
    >
      {/* Badge */}
      {warranty.badge && (
        <div className="absolute -top-2.5 left-4">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
            <SparklesIcon className="w-3 h-3" />
            {warranty.badge}
          </span>
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h4 className="text-base font-semibold text-gray-900">{warranty.name}</h4>
            <p className="text-sm text-gray-500">{warranty.durationMonths} months coverage</p>
          </div>

          {/* Price */}
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{formatCurrency(warranty.price)}</p>
            <p className="text-xs text-green-600 font-medium">
              {formatCurrency(warranty.pricePerMonth)}/mo
            </p>
          </div>
        </div>

        {/* Coverage summary */}
        <p className="text-sm text-gray-600 mb-3">{warranty.coverage}</p>

        {/* Deductible info */}
        {warranty.deductible > 0 && (
          <p className="text-xs text-amber-600 mb-3">
            {formatCurrency(warranty.deductible)} deductible per claim
          </p>
        )}

        {/* Details toggle */}
        <button
          type="button"
          onClick={onToggleDetails}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mb-3"
        >
          {showDetails ? (
            <>
              <ChevronUpIcon className="w-3 h-3" />
              Hide details
            </>
          ) : (
            <>
              <ChevronDownIcon className="w-3 h-3" />
              View coverage details
            </>
          )}
        </button>

        {/* Expanded details */}
        {showDetails && warranty.coverageDetails && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg text-xs">
            <p className="font-medium text-gray-700 mb-2">What's covered:</p>
            <ul className="space-y-1">
              {Object.entries(warranty.coverageDetails).map(([key, value]) => (
                value && (
                  <li key={key} className="flex items-center gap-2 text-gray-600">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </li>
                )
              ))}
            </ul>
            {warranty.exclusions && warranty.exclusions.length > 0 && (
              <>
                <p className="font-medium text-gray-700 mt-3 mb-2">Not covered:</p>
                <ul className="space-y-1">
                  {warranty.exclusions.map((exclusion, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-gray-500">
                      <XMarkIcon className="w-3.5 h-3.5 text-red-400" />
                      {exclusion}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelect(warranty)}
            className={`
              flex-1 py-2.5 px-4 rounded-lg text-sm font-medium
              transition-colors duration-150
              ${isSelected
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {isSelected ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircleIcon className="w-4 h-4" />
                Added
              </span>
            ) : (
              'Add Protection'
            )}
          </button>

          {!isSelected && (
            <button
              type="button"
              onClick={onDecline}
              className="py-2.5 px-4 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Decline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Product warranty row component
 */
function ProductWarrantyRow({
  item,
  warranties,
  selectedWarranty,
  onSelectWarranty,
  onDecline,
  salesScript,
  isExpanded,
  onToggle,
}) {
  const [showScriptTips, setShowScriptTips] = useState(false);
  const [expandedWarrantyId, setExpandedWarrantyId] = useState(null);

  const handleToggleDetails = (warrantyId) => {
    setExpandedWarrantyId(expandedWarrantyId === warrantyId ? null : warrantyId);
  };

  if (!warranties || warranties.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 last:border-0">
      {/* Product header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center
            ${selectedWarranty ? 'bg-green-100' : 'bg-blue-100'}
          `}>
            {selectedWarranty ? (
              <ShieldCheckSolid className="w-5 h-5 text-green-600" />
            ) : (
              <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">{item.productName}</p>
            <p className="text-xs text-gray-500">
              {selectedWarranty
                ? `Protected: ${selectedWarranty.name}`
                : `${warranties.length} protection option${warranties.length > 1 ? 's' : ''} available`
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedWarranty && (
            <span className="text-sm font-medium text-green-600">
              +{formatCurrency(selectedWarranty.price)}
            </span>
          )}
          <ChevronDownIcon
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Sales script helper */}
          {salesScript && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowScriptTips(!showScriptTips)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <ChatBubbleBottomCenterTextIcon className="w-4 h-4" />
                {showScriptTips ? 'Hide' : 'Show'} sales tips
              </button>

              {showScriptTips && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800 mb-3 italic">
                    "{salesScript.mainScript}"
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-blue-700 mb-2">Talking Points:</p>
                      <ul className="space-y-1">
                        {salesScript.talkingPoints?.slice(0, 3).map((point, idx) => (
                          <li key={idx} className="text-xs text-blue-600 flex items-start gap-1">
                            <span className="text-blue-400">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-blue-700 mb-2">Close:</p>
                      <ul className="space-y-1">
                        {salesScript.closeStatements?.slice(0, 2).map((close, idx) => (
                          <li key={idx} className="text-xs text-blue-600 italic">
                            "{close}"
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Warranty options */}
          <div className="space-y-3">
            {warranties.map((warranty) => (
              <WarrantyOptionCard
                key={warranty.warrantyId}
                warranty={warranty}
                isSelected={selectedWarranty?.warrantyId === warranty.warrantyId}
                onSelect={onSelectWarranty}
                onDecline={onDecline}
                showDetails={expandedWarrantyId === warranty.warrantyId}
                onToggleDetails={() => handleToggleDetails(warranty.warrantyId)}
              />
            ))}
          </div>

          {/* Decline all option */}
          {!selectedWarranty && (
            <button
              type="button"
              onClick={onDecline}
              className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              No thanks, continue without protection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Main warranty upsell component
 */
export function WarrantyUpsell({
  cartItems,
  onWarrantiesChange,
  selectedWarranties = {},
  onComplete,
  onSkip,
}) {
  const [eligibilityData, setEligibilityData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [salesScripts, setSalesScripts] = useState({});

  // Fetch eligible warranties for all cart items
  useEffect(() => {
    const fetchEligibility = async () => {
      if (!cartItems || cartItems.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const products = cartItems.map((item) => ({
          productId: item.productId,
          price: item.unitPrice,
        }));

        const response = await fetch(`${API_BASE}/warranty/eligible`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({ products }),
        });

        const result = await response.json();

        if (result.success && result.results) {
          const eligibility = {};
          const scripts = {};

          result.results.forEach((r, index) => {
            const item = cartItems[index];
            if (r.eligible && r.warranties && r.warranties.length > 0) {
              eligibility[item.id] = {
                productId: r.productId,
                productName: r.productName,
                warranties: r.warranties,
              };
              scripts[item.id] = {
                mainScript: r.suggestedScript,
                talkingPoints: [
                  `Only ${formatCurrency(r.warranties[0]?.pricePerMonth || 0)}/month`,
                  'Covers what manufacturer warranty doesn\'t',
                  'Easy claims process',
                ],
                closeStatements: [
                  'Should I add the protection plan?',
                  'Would you like coverage for this?',
                ],
              };
            }
          });

          setEligibilityData(eligibility);
          setSalesScripts(scripts);

          // Auto-expand first eligible item
          const firstEligible = Object.keys(eligibility)[0];
          if (firstEligible) {
            setExpandedItemId(firstEligible);
          }
        }
      } catch (error) {
        console.error('[WarrantyUpsell] Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEligibility();
  }, [cartItems]);

  // Calculate total warranty value
  const totalWarrantyValue = useMemo(() => {
    return Object.values(selectedWarranties).reduce(
      (sum, w) => sum + (w?.price || 0),
      0
    );
  }, [selectedWarranties]);

  // Count eligible items
  const eligibleItems = useMemo(() => {
    return Object.keys(eligibilityData).length;
  }, [eligibilityData]);

  // Count protected items
  const protectedItems = useMemo(() => {
    return Object.keys(selectedWarranties).filter((k) => selectedWarranties[k]).length;
  }, [selectedWarranties]);

  // Handle warranty selection
  const handleSelectWarranty = useCallback((itemId, warranty) => {
    const newSelected = {
      ...selectedWarranties,
      [itemId]: warranty,
    };
    onWarrantiesChange?.(newSelected);
  }, [selectedWarranties, onWarrantiesChange]);

  // Handle warranty decline
  const handleDecline = useCallback(async (itemId) => {
    const item = cartItems.find((i) => i.id === itemId);
    const eligibility = eligibilityData[itemId];

    // Track decline for analytics
    try {
      await fetch(`${API_BASE}/warranty/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({
          productId: item?.productId,
          warrantyOffered: eligibility?.warranties?.map((w) => w.warrantyId) || [],
          declineReason: 'customer_declined',
        }),
      });
    } catch (error) {
      console.error('[WarrantyUpsell] Decline tracking error:', error);
    }

    // Remove from selected and collapse
    const newSelected = { ...selectedWarranties };
    delete newSelected[itemId];
    onWarrantiesChange?.(newSelected);

    // Move to next item or close
    const eligibleIds = Object.keys(eligibilityData);
    const currentIndex = eligibleIds.indexOf(itemId);
    if (currentIndex < eligibleIds.length - 1) {
      setExpandedItemId(eligibleIds[currentIndex + 1]);
    } else {
      setExpandedItemId(null);
    }
  }, [cartItems, eligibilityData, selectedWarranties, onWarrantiesChange]);

  // Handle toggle expand
  const handleToggle = useCallback((itemId) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  }, [expandedItemId]);

  // Handle continue
  const handleContinue = useCallback(() => {
    onComplete?.(selectedWarranties);
  }, [selectedWarranties, onComplete]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Checking protection options...</p>
      </div>
    );
  }

  // No eligible items
  if (eligibleItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ShieldCheckIcon className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-gray-500 mb-4">No protection plans available for these items</p>
        <button
          type="button"
          onClick={onSkip}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Continue to Payment
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-full mb-3">
          <ShieldCheckIcon className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Protect Your Purchase</h2>
        <p className="text-sm text-gray-500">
          {eligibleItems} item{eligibleItems > 1 ? 's' : ''} eligible for protection plans
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
        <InformationCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Why add protection?</p>
          <p className="text-amber-700">
            Covers repairs and replacements beyond the manufacturer warranty.
            Plans can only be purchased with the product today.
          </p>
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl bg-white mb-4">
        {cartItems
          .filter((item) => eligibilityData[item.id])
          .map((item) => (
            <ProductWarrantyRow
              key={item.id}
              item={item}
              warranties={eligibilityData[item.id]?.warranties || []}
              selectedWarranty={selectedWarranties[item.id]}
              onSelectWarranty={(warranty) => handleSelectWarranty(item.id, warranty)}
              onDecline={() => handleDecline(item.id)}
              salesScript={salesScripts[item.id]}
              isExpanded={expandedItemId === item.id}
              onToggle={() => handleToggle(item.id)}
            />
          ))}
      </div>

      {/* Summary */}
      {protectedItems > 0 && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheckSolid className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {protectedItems} item{protectedItems > 1 ? 's' : ''} protected
              </span>
            </div>
            <span className="text-lg font-bold text-green-700">
              +{formatCurrency(totalWarrantyValue)}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="
            flex-1 py-3 px-4
            text-sm font-medium text-gray-700
            bg-gray-100 hover:bg-gray-200
            rounded-xl
            transition-colors duration-150
          "
        >
          {protectedItems > 0 ? 'Remove All' : 'Skip Protection'}
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="
            flex-1 py-3 px-4
            text-sm font-medium text-white
            bg-blue-600 hover:bg-blue-700
            rounded-xl
            transition-colors duration-150
          "
        >
          {protectedItems > 0 ? 'Continue with Protection' : 'Continue Without'}
        </button>
      </div>
    </div>
  );
}

export default WarrantyUpsell;
