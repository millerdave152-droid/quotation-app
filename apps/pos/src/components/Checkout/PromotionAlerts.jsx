/**
 * TeleTime POS - Promotion Alerts Component
 * Displays available promotions and near-miss opportunities to cashier
 */

import { useState, useCallback } from 'react';
import {
  SparklesIcon,
  TagIcon,
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Individual promotion card for auto-applied promotions
 */
function AutoAppliedCard({ promotion }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
      <SparklesIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-green-800 truncate">
          {promotion.name}
        </p>
        <p className="text-xs text-green-600">
          Saves {formatCurrency(promotion.discountCents / 100)}
        </p>
      </div>
      {promotion.badgeText && (
        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
          {promotion.badgeText}
        </span>
      )}
    </div>
  );
}

/**
 * Available promo code card with copy functionality
 */
function AvailableCodeCard({ promotion, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(promotion.code);
    setCopied(true);
    onCopy?.(promotion.code);
    setTimeout(() => setCopied(false), 2000);
  }, [promotion.code, onCopy]);

  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
      <TagIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-blue-800">
            {promotion.code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-0.5 text-blue-500 hover:text-blue-700 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <ClipboardDocumentIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-xs text-blue-600 truncate">
          {promotion.name}
          {promotion.potentialDiscountCents > 0 && (
            <span className="ml-1 text-blue-700 font-medium">
              (up to {formatCurrency(promotion.potentialDiscountCents / 100)} off)
            </span>
          )}
        </p>
        {promotion.hint && (
          <p className="text-xs text-blue-500 italic">{promotion.hint}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Near-miss promotion card with progress indicator
 */
function NearMissCard({ nearMiss }) {
  const progressPercent = nearMiss.percentComplete || 0;

  return (
    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <ArrowTrendingUpIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800">
            {nearMiss.message}
          </p>
          {nearMiss.code && (
            <p className="text-xs text-amber-600">
              Code: <span className="font-mono font-semibold">{nearMiss.code}</span>
            </p>
          )}
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-2 h-1.5 bg-amber-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-amber-600 mt-1 text-right">
        {progressPercent}% there
      </p>
    </div>
  );
}

/**
 * Main promotion alerts component
 * @param {object} props
 * @param {Array} props.autoApplied - Auto-applied promotions
 * @param {Array} props.available - Available promo codes
 * @param {Array} props.nearMiss - Near-miss promotions
 * @param {boolean} props.isLoading - Loading state
 * @param {boolean} props.collapsed - Initial collapsed state
 * @param {function} props.onCodeCopy - Callback when code is copied
 */
export function PromotionAlerts({
  autoApplied = [],
  available = [],
  nearMiss = [],
  isLoading = false,
  collapsed: initialCollapsed = false,
  onCodeCopy,
}) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const hasAutoApplied = autoApplied.length > 0;
  const hasAvailable = available.length > 0;
  const hasNearMiss = nearMiss.length > 0;
  const hasContent = hasAutoApplied || hasAvailable || hasNearMiss;

  // Don't render if no content
  if (!hasContent && !isLoading) {
    return null;
  }

  // Count badges
  const totalCount = autoApplied.length + available.length + nearMiss.length;

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="
          w-full px-3 py-2
          flex items-center justify-between
          bg-purple-50 hover:bg-purple-100
          transition-colors duration-150
        "
      >
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-800">
            Promotions
          </span>
          {totalCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-200 text-purple-700 rounded-full">
              {totalCount}
            </span>
          )}
          {isLoading && (
            <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {isCollapsed ? (
          <ChevronDownIcon className="w-4 h-4 text-purple-600" />
        ) : (
          <ChevronUpIcon className="w-4 h-4 text-purple-600" />
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-3 space-y-3 bg-white">
          {/* Auto-applied promotions */}
          {hasAutoApplied && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Applied Automatically
              </p>
              <div className="space-y-1.5">
                {autoApplied.map((promo) => (
                  <AutoAppliedCard key={promo.id} promotion={promo} />
                ))}
              </div>
            </div>
          )}

          {/* Available promo codes */}
          {hasAvailable && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Offer to Customer
              </p>
              <div className="space-y-1.5">
                {available.map((promo) => (
                  <AvailableCodeCard
                    key={promo.id}
                    promotion={promo}
                    onCopy={onCodeCopy}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Near-miss promotions */}
          {hasNearMiss && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Almost There!
              </p>
              <div className="space-y-1.5">
                {nearMiss.map((nm, idx) => (
                  <NearMissCard key={`${nm.promotionId}-${idx}`} nearMiss={nm} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state while loading */}
          {isLoading && !hasContent && (
            <div className="py-4 text-center">
              <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-500">Checking promotions...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PromotionAlerts;
