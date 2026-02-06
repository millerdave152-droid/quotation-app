/**
 * Expiring Quote Row Component
 * Individual quote row with expandable actions for the expiring quotes widget
 */

import React from 'react';
import {
  ClockIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  ShoppingCartIcon,
  ChevronRightIcon,
  UserIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';

/**
 * Format currency compactly
 */
function formatCurrency(amount) {
  if (amount == null) return '$0';
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

/**
 * Format phone for tel: link
 */
function formatPhoneLink(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
}

/**
 * Urgency indicator component
 */
function UrgencyIndicator({ daysUntilExpiry }) {
  if (daysUntilExpiry <= 0) {
    return (
      <div className="flex items-center gap-1 text-red-600">
        <ExclamationCircleIcon className="w-4 h-4" />
        <span className="text-xs font-bold uppercase">Expired</span>
      </div>
    );
  }

  if (daysUntilExpiry === 1) {
    return (
      <div className="flex items-center gap-1 text-red-600 animate-pulse">
        <ExclamationTriangleIcon className="w-4 h-4" />
        <span className="text-xs font-bold uppercase">Tomorrow!</span>
      </div>
    );
  }

  if (daysUntilExpiry <= 3) {
    return (
      <div className="flex items-center gap-1 text-orange-600">
        <ClockIcon className="w-4 h-4" />
        <span className="text-xs font-semibold">{daysUntilExpiry} days</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-yellow-600">
      <ClockIcon className="w-4 h-4" />
      <span className="text-xs font-medium">{daysUntilExpiry} days</span>
    </div>
  );
}

/**
 * Expiring Quote Row
 */
export default function ExpiringQuoteRow({
  quote,
  expanded = false,
  onToggleExpand,
  onConvertToSale,
  onViewQuote,
  onCall,
  showActions = true,
}) {
  const isUrgent = quote.daysUntilExpiry <= 1;
  const isSoon = quote.daysUntilExpiry <= 3 && quote.daysUntilExpiry > 1;

  // Determine row styling based on urgency
  const rowClasses = isUrgent
    ? 'bg-red-50 border-red-200 hover:bg-red-100'
    : isSoon
    ? 'bg-orange-50/50 border-orange-200 hover:bg-orange-100/50'
    : 'bg-white border-gray-200 hover:bg-gray-50';

  const handleRowClick = () => {
    if (showActions) {
      onToggleExpand?.();
    } else {
      onViewQuote?.(quote);
    }
  };

  const handleCall = (e) => {
    e.stopPropagation();
    if (onCall) {
      onCall(quote);
    } else if (quote.customerPhone) {
      window.location.href = `tel:${formatPhoneLink(quote.customerPhone)}`;
    }
  };

  const handleConvert = (e) => {
    e.stopPropagation();
    onConvertToSale?.(quote);
  };

  const handleView = (e) => {
    e.stopPropagation();
    onViewQuote?.(quote);
  };

  return (
    <div
      className={`rounded-lg border transition-all cursor-pointer ${rowClasses}`}
      onClick={handleRowClick}
    >
      {/* Main row content */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left side - Customer & Quote info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 truncate">
                {quote.customerName || 'Unknown Customer'}
              </span>
              {quote.customerTier && (
                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                  quote.customerTier === 'platinum' ? 'bg-purple-100 text-purple-700' :
                  quote.customerTier === 'gold' ? 'bg-yellow-100 text-yellow-700' :
                  quote.customerTier === 'silver' ? 'bg-gray-200 text-gray-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {quote.customerTier}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-gray-500">
                <DocumentTextIcon className="w-3.5 h-3.5" />
                {quote.quoteNumber}
              </span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(quote.totalValue)}
              </span>
              <span className="text-gray-400">
                {quote.itemCount} item{quote.itemCount !== 1 ? 's' : ''}
              </span>
            </div>

            {quote.assignedRep && quote.assignedRep !== 'Unassigned' && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                <UserIcon className="w-3 h-3" />
                {quote.assignedRep}
              </div>
            )}
          </div>

          {/* Right side - Urgency & Expand */}
          <div className="flex items-center gap-3">
            <UrgencyIndicator daysUntilExpiry={quote.daysUntilExpiry} />
            {showActions && (
              <ChevronRightIcon
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expanded ? 'rotate-90' : ''
                }`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && showActions && (
        <div className="px-3 pb-3">
          <div className="pt-3 border-t border-gray-200 flex items-center gap-2">
            {/* Call button */}
            {quote.customerPhone && (
              <button
                onClick={handleCall}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Call</span>
                <span className="sm:hidden">{quote.customerPhone}</span>
              </button>
            )}

            {/* Convert to Sale button */}
            <button
              onClick={handleConvert}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ShoppingCartIcon className="w-4 h-4" />
              Convert to Sale
            </button>

            {/* View Quote button */}
            <button
              onClick={handleView}
              className="px-4 py-2.5 border border-gray-300 hover:bg-gray-100 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              View
            </button>
          </div>

          {/* Contact info */}
          {(quote.customerPhone || quote.customerEmail) && (
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
              {quote.customerPhone && (
                <span>{quote.customerPhone}</span>
              )}
              {quote.customerEmail && (
                <span className="truncate">{quote.customerEmail}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
