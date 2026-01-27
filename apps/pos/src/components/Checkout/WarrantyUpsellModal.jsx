/**
 * TeleTime POS - Warranty Upsell Modal Component
 * Modal for warranty upsell during checkout - shown for each eligible item
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon as ShieldCheckSolid } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';
import WarrantyOptionCard from './WarrantyOptionCard';

/**
 * Progress indicator dots
 */
function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`
            w-2 h-2 rounded-full transition-all duration-300
            ${i < current
              ? 'bg-blue-500'
              : i === current
                ? 'bg-blue-500 w-4'
                : 'bg-gray-300'
            }
          `}
        />
      ))}
    </div>
  );
}

/**
 * Success animation component
 */
function SuccessAnimation({ warrantyName, onAnimationEnd }) {
  useEffect(() => {
    const timer = setTimeout(onAnimationEnd, 1500);
    return () => clearTimeout(timer);
  }, [onAnimationEnd]);

  return (
    <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center z-10 animate-fade-in">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-scale-in">
        <ShieldCheckSolid className="w-10 h-10 text-green-500" />
      </div>
      <p className="text-lg font-semibold text-gray-900 mb-1">Protection Added!</p>
      <p className="text-sm text-gray-500">{warrantyName}</p>
    </div>
  );
}

/**
 * Product display section
 */
function ProductSection({ item }) {
  // Get product image or placeholder
  const imageUrl = item.cartItem?.imageUrl || item.cartItem?.image_url;

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl mb-6">
      {/* Product image */}
      <div className="w-20 h-20 bg-white rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.productName}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-300">
              {item.productName?.charAt(0) || '?'}
            </span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{item.productName}</h3>
        <p className="text-sm text-gray-500">
          {formatCurrency(item.productPrice || item.cartItem?.unitPrice)}
        </p>
        {item.cartItem?.serialNumber && (
          <p className="text-xs text-gray-400 mt-1">
            S/N: {item.cartItem.serialNumber}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Main warranty upsell modal
 */
export function WarrantyUpsellModal({
  isOpen,
  currentItem,
  progress,
  selectedWarranty,
  onSelectWarranty,
  onAddAndContinue,
  onDecline,
  onSkipAll,
  onGoBack,
  onClose,
}) {
  const [localSelectedWarranty, setLocalSelectedWarranty] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [addedWarrantyName, setAddedWarrantyName] = useState('');

  // Reset selection when item changes
  useEffect(() => {
    setLocalSelectedWarranty(selectedWarranty || null);
    setShowSuccess(false);
  }, [currentItem?.cartItem?.id, selectedWarranty]);

  // Handle warranty selection (local state)
  const handleSelect = useCallback((warranty) => {
    setLocalSelectedWarranty(warranty);
    onSelectWarranty?.(warranty);
  }, [onSelectWarranty]);

  // Handle add protection
  const handleAddProtection = useCallback(() => {
    if (!localSelectedWarranty) return;

    setAddedWarrantyName(localSelectedWarranty.name);
    setShowSuccess(true);
  }, [localSelectedWarranty]);

  // Handle success animation end
  const handleSuccessEnd = useCallback(() => {
    setShowSuccess(false);
    onAddAndContinue?.(localSelectedWarranty);
  }, [localSelectedWarranty, onAddAndContinue]);

  // Get recommended warranty (featured or first)
  const recommendedWarranty = useMemo(() => {
    if (!currentItem?.warranties) return null;
    return currentItem.warranties.find((w) => w.isFeatured || w.badge) || currentItem.warranties[0];
  }, [currentItem]);

  // Sort warranties: recommended first, then by duration
  const sortedWarranties = useMemo(() => {
    if (!currentItem?.warranties) return [];
    return [...currentItem.warranties].sort((a, b) => {
      if (a.isFeatured || a.badge) return -1;
      if (b.isFeatured || b.badge) return 1;
      return b.durationMonths - a.durationMonths;
    });
  }, [currentItem]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !currentItem) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Success animation overlay */}
        {showSuccess && (
          <SuccessAnimation
            warrantyName={addedWarrantyName}
            onAnimationEnd={handleSuccessEnd}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {progress.current > 1 && (
              <button
                type="button"
                onClick={onGoBack}
                className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div>
              <p className="text-sm text-gray-500">
                Item {progress.current} of {progress.total}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Hero section */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full mb-4">
              <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Protect Your Purchase
            </h2>
            <p className="text-gray-500">
              Keep your new {currentItem.productName?.split(' ')[0] || 'item'} protected against the unexpected
            </p>
          </div>

          {/* Product info */}
          <ProductSection item={currentItem} />

          {/* Warranty options */}
          <div className="space-y-4">
            {sortedWarranties.map((warranty) => (
              <WarrantyOptionCard
                key={warranty.warrantyId}
                warranty={warranty}
                isSelected={localSelectedWarranty?.warrantyId === warranty.warrantyId}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Value proposition */}
          {recommendedWarranty && !localSelectedWarranty && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-start gap-3">
                <SparklesIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    Most customers choose the {recommendedWarranty.name}
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    For just {formatCurrency(recommendedWarranty.pricePerMonth)}/month, you get peace of mind
                    knowing your {formatCurrency(currentItem.productPrice)} investment is protected.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          {/* Progress dots */}
          {progress.total > 1 && (
            <div className="mb-4">
              <ProgressDots current={progress.current - 1} total={progress.total} />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDecline}
              className="
                flex-1 py-3 px-4
                text-sm font-medium text-gray-600
                bg-white hover:bg-gray-100
                border border-gray-300
                rounded-xl
                transition-colors duration-150
              "
            >
              No thanks
            </button>

            <button
              type="button"
              onClick={handleAddProtection}
              disabled={!localSelectedWarranty}
              className="
                flex-1 py-3 px-4
                flex items-center justify-center gap-2
                text-sm font-medium text-white
                bg-blue-600 hover:bg-blue-700
                disabled:bg-gray-300 disabled:cursor-not-allowed
                rounded-xl
                transition-colors duration-150
              "
            >
              {localSelectedWarranty ? (
                <>
                  Add for {formatCurrency(localSelectedWarranty.price)}
                  <ChevronRightIcon className="w-4 h-4" />
                </>
              ) : (
                'Select a plan'
              )}
            </button>
          </div>

          {/* Skip all link */}
          {progress.total > 1 && (
            <button
              type="button"
              onClick={onSkipAll}
              className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip protection for all items
            </button>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default WarrantyUpsellModal;
