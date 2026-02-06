/**
 * TeleTime POS - Cart Rebate Summary Component
 * Displays rebate totals in cart summary section
 */

import { useState } from 'react';
import {
  BanknotesIcon,
  EnvelopeIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value || 0);
}

/**
 * Rebate Line Item in Summary
 */
function RebateLineItem({ icon: Icon, label, amount, type, onClick, children }) {
  const colorClasses = {
    instant: 'text-green-600',
    'mail_in': 'text-blue-600',
    online: 'text-purple-600',
    info: 'text-gray-500',
  };

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${colorClasses[type] || 'text-gray-500'}`} />
        <span className="text-sm text-gray-700">{label}</span>
        {onClick && (
          <button
            type="button"
            onClick={onClick}
            className="p-0.5 text-gray-400 hover:text-blue-600 transition-colors"
          >
            <InformationCircleIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${colorClasses[type] || 'text-gray-700'}`}>
          {type === 'instant' ? '-' : ''}{formatCurrency(amount)}
        </span>
        {children}
      </div>
    </div>
  );
}

/**
 * Cart Rebate Summary Component
 */
export function CartRebateSummary({
  instantRebates = [],
  mailInRebates = [],
  onlineRebates = [],
  totalInstantSavings = 0,
  totalMailInSavings = 0,
  totalOnlineSavings = 0,
  onMailInInfoClick,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(false);

  const hasInstant = totalInstantSavings > 0;
  const hasMailIn = totalMailInSavings > 0 || totalOnlineSavings > 0;
  const totalPotential = totalMailInSavings + totalOnlineSavings;

  if (!hasInstant && !hasMailIn) return null;

  // Compact mode - just show totals
  if (compact) {
    return (
      <div className="space-y-1">
        {hasInstant && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-green-700">
              <CheckCircleIcon className="w-4 h-4" />
              Instant Rebates Applied
            </span>
            <span className="font-medium text-green-700">
              -{formatCurrency(totalInstantSavings)}
            </span>
          </div>
        )}
        {hasMailIn && (
          <button
            type="button"
            onClick={onMailInInfoClick}
            className="flex items-center justify-between w-full text-sm text-left hover:bg-blue-50 rounded px-1 -mx-1 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-blue-700">
              <EnvelopeIcon className="w-4 h-4" />
              Mail-in Rebates Available
            </span>
            <span className="flex items-center gap-1 font-medium text-blue-700">
              {formatCurrency(totalPotential)}
              <InformationCircleIcon className="w-4 h-4" />
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-100 rounded-lg">
            <BanknotesIcon className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-900">Manufacturer Rebates</p>
            <p className="text-xs text-gray-500">
              {hasInstant && `${formatCurrency(totalInstantSavings)} instant`}
              {hasInstant && hasMailIn && ' + '}
              {hasMailIn && `${formatCurrency(totalPotential)} mail-in`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-green-700">
            Save {formatCurrency(totalInstantSavings + totalPotential)}
          </span>
          {expanded ? (
            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-green-200/50">
          {/* Instant Rebates */}
          {hasInstant && (
            <div className="pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Instant Savings (Applied)
              </p>
              {instantRebates.map((rebate, index) => (
                <div
                  key={rebate.rebateId || index}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700">
                      {rebate.productName}
                      {rebate.quantity > 1 && ` x${rebate.quantity}`}
                    </span>
                  </div>
                  <span className="font-medium text-green-700">
                    -{formatCurrency(rebate.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-2 border-t border-green-200/50 text-sm font-medium">
                <span className="text-green-700">Total Instant Savings</span>
                <span className="text-green-700">-{formatCurrency(totalInstantSavings)}</span>
              </div>
            </div>
          )}

          {/* Mail-in/Online Rebates */}
          {hasMailIn && (
            <div className={hasInstant ? 'pt-4 mt-3 border-t border-gray-200' : 'pt-3'}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Mail-in / Online Rebates
                </p>
                <button
                  type="button"
                  onClick={onMailInInfoClick}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  View Details
                </button>
              </div>

              {[...mailInRebates, ...onlineRebates].map((rebate, index) => (
                <div
                  key={rebate.rebateId || index}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-blue-500" />
                    <span className="text-gray-700">
                      {rebate.productName}
                      {rebate.quantity > 1 && ` x${rebate.quantity}`}
                    </span>
                  </div>
                  <span className="font-medium text-blue-700">
                    {formatCurrency(rebate.amount)}
                  </span>
                </div>
              ))}

              <div className="flex justify-between pt-2 mt-2 border-t border-blue-200/50 text-sm">
                <span className="text-blue-700 font-medium">Potential Additional Savings</span>
                <span className="text-blue-700 font-medium">{formatCurrency(totalPotential)}</span>
              </div>

              {/* Info Banner */}
              <div className="mt-3 p-2 bg-blue-100 rounded-lg">
                <p className="text-xs text-blue-800">
                  <InformationCircleIcon className="w-3.5 h-3.5 inline mr-1" />
                  Customer must submit claim after purchase. Details will be printed on receipt.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mini Rebate Summary for Checkout
 */
export function CheckoutRebateSummary({
  totalInstantSavings = 0,
  totalMailInSavings = 0,
  totalOnlineSavings = 0,
  onMailInInfoClick,
}) {
  const hasInstant = totalInstantSavings > 0;
  const hasMailIn = totalMailInSavings > 0 || totalOnlineSavings > 0;
  const totalPotential = totalMailInSavings + totalOnlineSavings;

  if (!hasInstant && !hasMailIn) return null;

  return (
    <div className="space-y-2 py-2 border-y border-gray-200">
      {hasInstant && (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-base">\u{1F4B0}</span>
            Instant Rebates Applied
          </span>
          <span className="text-sm font-semibold text-green-600">
            -{formatCurrency(totalInstantSavings)}
          </span>
        </div>
      )}

      {hasMailIn && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onMailInInfoClick}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
          >
            <span className="text-base">\u{1F4EC}</span>
            <span>Mail-in Rebates Available</span>
            <InformationCircleIcon className="w-4 h-4 text-blue-500" />
          </button>
          <span className="text-sm font-semibold text-blue-600">
            {formatCurrency(totalPotential)}
          </span>
        </div>
      )}

      {/* Total Savings */}
      <div className="flex items-center justify-between pt-2 border-t border-dashed border-gray-300">
        <span className="text-sm font-medium text-gray-700">Total Rebate Savings</span>
        <span className="text-sm font-bold text-green-700">
          {formatCurrency(totalInstantSavings + totalPotential)}
        </span>
      </div>
    </div>
  );
}

/**
 * Floating Rebate Notification
 * Shows when rebates are available/applied
 */
export function RebateNotification({
  type,
  message,
  amount,
  onDismiss,
  autoHide = 5000,
}) {
  const [visible, setVisible] = useState(true);

  // Auto-hide after delay
  if (autoHide) {
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, autoHide);
  }

  if (!visible) return null;

  const config = {
    instant: {
      bgColor: 'bg-green-600',
      icon: BanknotesIcon,
    },
    'mail_in': {
      bgColor: 'bg-blue-600',
      icon: EnvelopeIcon,
    },
  };

  const { bgColor, icon: Icon } = config[type] || config.instant;

  return (
    <div className={`
      fixed bottom-24 left-1/2 -translate-x-1/2 z-50
      flex items-center gap-3 px-4 py-3
      ${bgColor} text-white rounded-lg shadow-xl
      animate-bounce-in
    `}>
      <Icon className="w-5 h-5" />
      <div>
        <p className="font-medium">{message}</p>
        {amount && (
          <p className="text-sm opacity-90">
            {type === 'instant' ? 'Saved' : 'Available'}: {formatCurrency(amount)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
      >
        <span className="sr-only">Dismiss</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default CartRebateSummary;
